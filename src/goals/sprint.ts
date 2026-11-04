/**
 * A sprint: a one-time word target the writer sets on the spot (ADR-0040).
 *
 * No timer and no history. It counts words from the moment it starts, by the
 * same measure as the day — added minus cut — and when it is reached it ends.
 * It is never saved, so it does not outlive the project being open.
 *
 * Plain values and functions, so the lifecycle is checked with no window.
 */

/** The smallest sprint worth starting. */
export const SPRINT_MINIMUM = 50;
/** What the box offers before the writer chooses. */
export const SPRINT_DEFAULT = 500;
/** An upper bound that only exists to keep a typo from being a number. */
export const SPRINT_MAXIMUM = 100_000;

export interface Sprint {
  readonly target: number;
  /**
   * Words added minus words cut since it started. Signed, so cutting a passage
   * and pasting it back nets nothing; what is shown never goes below zero.
   */
  readonly net: number;
}

/** Whether a number can be a sprint's target. */
export function isSprintTarget(target: number): boolean {
  return Number.isInteger(target) && target >= SPRINT_MINIMUM && target <= SPRINT_MAXIMUM;
}

/** Start a sprint, or `undefined` for a target that is not allowed. */
export function startSprint(target: number): Sprint | undefined {
  return isSprintTarget(target) ? { target, net: 0 } : undefined;
}

/** The sprint after some words were added (positive) or cut (negative). */
export function advanceSprint(sprint: Sprint, delta: number): Sprint {
  return { target: sprint.target, net: sprint.net + delta };
}

/** Words written in the sprint, never below zero. */
export function sprintWritten(sprint: Sprint): number {
  return Math.max(0, sprint.net);
}

/** Whether the target has been reached. */
export function sprintReached(sprint: Sprint): boolean {
  return sprintWritten(sprint) >= sprint.target;
}
