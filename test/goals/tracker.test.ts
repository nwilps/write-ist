/** The live goals (ADR-0040): net words, the day's boundary, the sprint, and the pill. */
import { describe, expect, it } from "vitest";
import { NO_GOALS } from "../../src/goals/history.ts";
import { GoalsTracker } from "../../src/goals/tracker.ts";
import type { Instant } from "../../src/instant.ts";

/** A clock the test sets: local time, as the writer's day is. */
function clock(at: Date): Instant & { set: (to: Date) => void } {
  let now = at;
  return { now: () => now, set: (to) => void (now = to) };
}
const evening = (): Date => new Date(2026, 10, 3, 21, 0);

/** A tracker with a goal of 500 words, or none (`null`). */
function tracker(goal: number | null = 500, at: Date = evening()) {
  const time = clock(at);
  const goals = new GoalsTracker({ ...NO_GOALS, goal: goal ?? undefined }, { instant: time });
  return { goals, time };
}

describe("words written today", () => {
  it("are words added minus words cut", () => {
    const { goals } = tracker();
    goals.wordsChanged(120);
    goals.wordsChanged(-20);
    goals.wordsChanged(15);
    expect(goals.view(9000).today).toBe(115);
  });

  it("are never below zero", () => {
    const { goals } = tracker();
    goals.wordsChanged(-300);
    expect(goals.view(9000).today).toBe(0);
    expect(goals.view(9000).pill?.text).toBe("0 / 500 today");
  });

  it("do not count a passage that was moved: cut it and the same words back", () => {
    const { goals } = tracker();
    goals.wordsChanged(-300);
    goals.wordsChanged(300);
    expect(goals.view(9000).today).toBe(0);
    goals.wordsChanged(50);
    goals.wordsChanged(-300);
    goals.wordsChanged(300);
    expect(goals.view(9000).today).toBe(50);
  });

  it("are today's alone: a new day starts again from nothing, and yesterday is kept", () => {
    const { goals, time } = tracker();
    goals.wordsChanged(400);
    time.set(new Date(2026, 10, 3, 23, 59, 59));
    goals.wordsChanged(10);
    expect(goals.view(1).today).toBe(410);
    time.set(new Date(2026, 10, 4, 0, 0, 0));
    expect(goals.view(1).today).toBe(0);
    goals.wordsChanged(7);
    expect(goals.view(1).today).toBe(7);
    expect(goals.data().days.get("2026-11-03")).toBe(410);
    expect(goals.data().days.get("2026-11-04")).toBe(7);
  });

  it("are recorded whether or not there is a goal, so turning one on has a past", () => {
    const { goals } = tracker(null);
    goals.wordsChanged(80);
    expect(goals.data().days.get("2026-11-03")).toBe(80);
    expect(goals.view(1).pill).toBeUndefined();
  });

  it("make the file dirty only when something changed", () => {
    const { goals } = tracker();
    expect(goals.dirty).toBe(false);
    goals.wordsChanged(0);
    expect(goals.dirty).toBe(false);
    goals.wordsChanged(1);
    expect(goals.dirty).toBe(true);
    goals.clean();
    expect(goals.dirty).toBe(false);
    goals.unclean();
    expect(goals.dirty).toBe(true);
  });
});

describe("the Goal pill", () => {
  it("is hidden while there is no goal", () => {
    expect(tracker(null).goals.view(1).pill).toBeUndefined();
  });

  it("shows the day's progress, stays after the goal is met, and shows when it is passed", () => {
    const { goals } = tracker();
    goals.wordsChanged(320);
    expect(goals.view(1).pill).toEqual({ text: "320 / 500 today", kind: "daily", state: "progress" });
    goals.wordsChanged(180);
    expect(goals.view(1).pill).toEqual({ text: "500 / 500 today", kind: "daily", state: "met" });
    goals.wordsChanged(120);
    expect(goals.view(1).pill).toEqual({ text: "620 / 500 today", kind: "daily", state: "exceeded" });
  });

  it("separates thousands", () => {
    const { goals } = tracker(2500);
    goals.wordsChanged(1234);
    expect(goals.view(1).pill?.text).toBe("1,234 / 2,500 today");
  });

  it("is hidden on a weekday the writer does not count", () => {
    const { goals } = tracker(); // Tuesday 3 November
    goals.setDaily(500, ["Mon", "Wed"]);
    goals.wordsChanged(100);
    expect(goals.view(1).pill).toBeUndefined();
    expect(goals.view(1).countsToday).toBe(false);
    expect(goals.view(1).today).toBe(100); // still recorded
  });

  it("gives way to a sprint while one runs, and comes back when it is over", () => {
    const { goals } = tracker();
    goals.wordsChanged(300);
    goals.startSprint(500);
    goals.wordsChanged(210);
    expect(goals.view(1).pill).toEqual({ text: "210 / 500 sprint", kind: "sprint", state: "progress" });
    expect(goals.view(1).today).toBe(510); // the day went on counting
    goals.endSprint();
    expect(goals.view(1).pill?.text).toBe("510 / 500 today");
  });

  it("shows a sprint even with no daily goal", () => {
    const { goals } = tracker(null);
    goals.startSprint(50);
    expect(goals.view(1).pill?.text).toBe("0 / 50 sprint");
  });
});

describe("a sprint", () => {
  it("counts from when it starts, not from the day's words", () => {
    const { goals } = tracker();
    goals.wordsChanged(1000);
    goals.startSprint(100);
    expect(goals.view(1).sprint).toEqual({ target: 100, written: 0 });
    goals.wordsChanged(40);
    expect(goals.view(1).sprint).toEqual({ target: 100, written: 40 });
  });

  it("ends and disappears when it is reached", () => {
    const { goals } = tracker();
    goals.startSprint(50);
    goals.wordsChanged(49);
    expect(goals.view(1).sprint).toBeDefined();
    goals.wordsChanged(1);
    expect(goals.view(1).sprint).toBeUndefined();
    expect(goals.view(1).pill?.kind).toBe("daily");
    goals.wordsChanged(500);
    expect(goals.view(1).sprint).toBeUndefined(); // gone, not restarted
  });

  it("will not start below the minimum, and can be ended early", () => {
    const { goals } = tracker();
    expect(goals.startSprint(49)).toBe(false);
    expect(goals.view(1).sprint).toBeUndefined();
    expect(goals.startSprint(50)).toBe(true);
    goals.endSprint();
    expect(goals.view(1).sprint).toBeUndefined();
  });

  it("is not part of what is written to the file", () => {
    const { goals } = tracker();
    goals.startSprint(500);
    expect(goals.dirty).toBe(false);
    expect(Object.keys(goals.data()).sort()).toEqual(["days", "goal", "weekdays"]);
  });
});

describe("the daily goal's settings", () => {
  it("turn it on, off, and choose the days; a number that is not allowed changes nothing", () => {
    const { goals } = tracker(null);
    expect(goals.setDaily(0, ["Mon"])).toBe(false);
    expect(goals.setDaily(2.5, ["Mon"])).toBe(false);
    expect(goals.dirty).toBe(false);
    expect(goals.setDaily(300, ["Mon", "Tue"])).toBe(true);
    expect(goals.data()).toMatchObject({ goal: 300, weekdays: ["Mon", "Tue"] });
    expect(goals.setDaily(undefined, ["Mon", "Tue"])).toBe(true);
    expect(goals.data().goal).toBeUndefined();
    expect(goals.dirty).toBe(true);
  });
});

describe("the view", () => {
  it("carries the totals, the streak and a chart of thirty days", () => {
    const time = clock(evening());
    const goals = new GoalsTracker(
      { goal: 100, weekdays: NO_GOALS.weekdays, days: new Map([["2026-11-01", 100], ["2026-11-02", 150]]) },
      { instant: time },
    );
    goals.wordsChanged(100);
    const view = goals.view(12345);
    expect(view.totalWords).toBe(12345);
    expect(view.streak).toBe(3);
    expect(view.bestStreak).toBe(3);
    expect(view.chart).toHaveLength(30);
    expect(view.chart.at(-1)).toMatchObject({ day: "2026-11-03", words: 100, met: true });
  });
});
