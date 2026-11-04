/** A sprint's lifecycle (ADR-0040): set on the spot, counted from the start, over when reached. */
import { describe, expect, it } from "vitest";
import {
  advanceSprint,
  isSprintTarget,
  SPRINT_DEFAULT,
  SPRINT_MINIMUM,
  sprintReached,
  sprintWritten,
  startSprint,
} from "../../src/goals/sprint.ts";

describe("starting a sprint", () => {
  it("offers 500, and will not start below 50", () => {
    expect(SPRINT_DEFAULT).toBe(500);
    expect(SPRINT_MINIMUM).toBe(50);
    expect(startSprint(50)).toEqual({ target: 50, net: 0 });
    expect(startSprint(49)).toBeUndefined();
    expect(startSprint(0)).toBeUndefined();
    expect(startSprint(-500)).toBeUndefined();
  });

  it("wants a whole number of words", () => {
    expect(isSprintTarget(500.5)).toBe(false);
    expect(isSprintTarget(Number.NaN)).toBe(false);
    expect(isSprintTarget(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("a sprint under way", () => {
  it("counts words added minus words cut, and shows nothing below zero", () => {
    let sprint = startSprint(100)!;
    sprint = advanceSprint(sprint, -30);
    expect(sprintWritten(sprint)).toBe(0);
    sprint = advanceSprint(sprint, 30);
    expect(sprintWritten(sprint)).toBe(0); // the moved passage nets nothing
    sprint = advanceSprint(sprint, 45);
    expect(sprintWritten(sprint)).toBe(45);
    expect(sprintReached(sprint)).toBe(false);
  });

  it("is reached at the target exactly, and past it", () => {
    expect(sprintReached(advanceSprint(startSprint(50)!, 50))).toBe(true);
    expect(sprintReached(advanceSprint(startSprint(50)!, 49))).toBe(false);
    expect(sprintReached(advanceSprint(startSprint(50)!, 400))).toBe(true);
  });
});
