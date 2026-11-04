/**
 * What a project remembers of its writing days, and what is worked out from it
 * (ADR-0040).
 *
 * **Words written in a day is added minus cut, never below zero.** The count
 * is kept signed — a writer who has cut 40 words and not yet pasted them back
 * is at −40, so the paste brings them to 0 rather than to 40 — and every
 * reader goes through `wordsOn`, which clamps.
 *
 * **A streak is consecutive counted days on which the goal was met.** The
 * writer picks which weekdays count; a day not picked neither breaks the
 * streak nor adds to it. Today, until it is over, can only help: a counted day
 * not yet met is still in progress, and does not break the streak.
 *
 * The goal is the one the project has now. Changing it re-reads the whole
 * history against the new number, which is what a writer who lowers a goal
 * would expect their streak to say.
 */
import { addDays, daysBetween, weekdayOf, WEEKDAYS, type Weekday } from "./day.ts";

/** A project's goal settings. */
export interface GoalSettings {
  /** Words a day, or `undefined` when the goal is off. */
  readonly goal: number | undefined;
  /** The weekdays that count. */
  readonly weekdays: readonly Weekday[];
}

/** Settings plus the days recorded, signed, by `YYYY-MM-DD`. */
export interface Goals extends GoalSettings {
  readonly days: ReadonlyMap<string, number>;
}

export const DEFAULT_WEEKDAYS: readonly Weekday[] = WEEKDAYS;

/** A project that has never had a goal. */
export const NO_GOALS: Goals = { goal: undefined, weekdays: DEFAULT_WEEKDAYS, days: new Map() };

/** The most a daily goal can be: a bound against a typo, not a judgement. */
export const MAXIMUM_GOAL = 100_000;

export function isGoalNumber(goal: number): boolean {
  return Number.isInteger(goal) && goal >= 1 && goal <= MAXIMUM_GOAL;
}

/** Words written on a day, never below zero. */
export function wordsOn(goals: Goals, day: string): number {
  return Math.max(0, goals.days.get(day) ?? 0);
}

/** Whether a day is one the writer counts. */
export function counts(goals: Goals, day: string): boolean {
  return goals.weekdays.includes(weekdayOf(day));
}

/** Whether a day is a counted day on which the goal was met. */
export function met(goals: Goals, day: string): boolean {
  return goals.goal !== undefined && counts(goals, day) && wordsOn(goals, day) >= goals.goal;
}

export interface Streaks {
  readonly current: number;
  readonly best: number;
}

/**
 * The current and the best streak as of `today`.
 *
 * One walk from the first recorded day to today. A counted day that was missed
 * ends the run; a day that is not counted passes over it; today, if not yet
 * met, is pending and passes over it too.
 */
export function streaks(goals: Goals, today: string): Streaks {
  if (goals.goal === undefined || goals.days.size === 0) return { current: 0, best: 0 };
  const first = [...goals.days.keys()].reduce((earliest, day) => (day < earliest ? day : earliest));
  let run = 0;
  let best = 0;
  for (let at = 0, last = daysBetween(first, today); at <= last; at++) {
    const day = addDays(first, at);
    if (!counts(goals, day)) continue;
    if (met(goals, day)) {
      run++;
      best = Math.max(best, run);
    } else if (day !== today) {
      run = 0;
    }
  }
  return { current: run, best };
}

/** One bar of the chart. */
export interface ChartDay {
  readonly day: string;
  readonly words: number;
  /** Whether the writer counts this weekday. */
  readonly counted: boolean;
  /** Whether the goal was met that day. */
  readonly met: boolean;
}

/** The last `length` days up to and including `today`, oldest first. */
export function chartDays(goals: Goals, today: string, length = 30): readonly ChartDay[] {
  return Array.from({ length }, (_, at) => {
    const day = addDays(today, at - (length - 1));
    return { day, words: wordsOn(goals, day), counted: counts(goals, day), met: met(goals, day) };
  });
}
