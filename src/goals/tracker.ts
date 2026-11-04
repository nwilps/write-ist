/**
 * The goals, live: what the Editor holds while a project is open (ADR-0040).
 *
 * It is told one thing about the manuscript — **how many words the last change
 * added or cut** — and works out the rest. Never the whole count, and never the
 * text, which is what keeps the three things that must not count from counting:
 *
 * - **Opening a file** is not a change. The session starts from the words the
 *   file has and tells the tracker nothing.
 * - **Another program's version loading** is not a change either; the session
 *   re-bases on it (`rebase`) without a delta.
 * - **Moving text** cuts and pastes the same words. The day's count is held
 *   signed, so −40 then +40 is 0 and not 40.
 *
 * The clock and the day's end are given, so a test can be both.
 */
import type { Instant } from "../instant.ts";
import { systemInstant } from "../instant.ts";
import { dayEndsAt, writingDayOf, type TimeOfDay, type Weekday } from "./day.ts";
import {
  chartDays,
  counts,
  isGoalNumber,
  streaks,
  wordsOn,
  type ChartDay,
  type Goals,
} from "./history.ts";
import { advanceSprint, sprintReached, sprintWritten, startSprint, type Sprint } from "./sprint.ts";

/** What the Goal pill says, and how to colour it. */
export interface GoalPill {
  /** `320 / 500 today`, or `210 / 500 sprint`. */
  readonly text: string;
  readonly kind: "daily" | "sprint";
  /** Progress, met (the goal is reached) or exceeded (past it). A sprint is only progress. */
  readonly state: "progress" | "met" | "exceeded";
}

/** Everything the Goals dialog and the pill draw, as of now. */
export interface GoalsView {
  readonly totalWords: number;
  /** Words written today, never below zero. */
  readonly today: number;
  readonly goal: number | undefined;
  readonly weekdays: readonly Weekday[];
  /** Whether today is a day the writer counts. */
  readonly countsToday: boolean;
  readonly streak: number;
  readonly bestStreak: number;
  readonly chart: readonly ChartDay[];
  /** The running sprint: its target and the words written in it. */
  readonly sprint: { readonly target: number; readonly written: number } | undefined;
  /** The pill, or `undefined` when there is no goal to show. */
  readonly pill: GoalPill | undefined;
}

const WITH_COMMAS = new Intl.NumberFormat("en-US");
const said = (words: number): string => WITH_COMMAS.format(words);

export interface GoalsTrackerOptions {
  readonly instant?: Instant;
  readonly dayEnds?: () => TimeOfDay;
}

export class GoalsTracker {
  private goals: Goals;
  private sprint: Sprint | undefined;
  private changed = false;
  private readonly instant: Instant;
  private readonly dayEnds: () => TimeOfDay;

  constructor(initial: Goals, options: GoalsTrackerOptions = {}) {
    this.goals = initial;
    this.instant = options.instant ?? systemInstant;
    this.dayEnds = options.dayEnds ?? dayEndsAt;
  }

  /** The writer's day, now. */
  today(): string {
    return writingDayOf(this.instant.now(), this.dayEnds());
  }

  /** The manuscript gained (positive) or lost (negative) words by an edit. */
  wordsChanged(delta: number): void {
    if (delta === 0) return;
    const day = this.today();
    const days = new Map(this.goals.days);
    days.set(day, (days.get(day) ?? 0) + delta);
    this.goals = { ...this.goals, days };
    this.changed = true;
    if (this.sprint !== undefined) {
      this.sprint = advanceSprint(this.sprint, delta);
      // Reached: it ends and goes, with nothing kept (no history, no fanfare).
      if (sprintReached(this.sprint)) this.sprint = undefined;
    }
  }

  /** Turn the goal on at `goal` words, or off with `undefined`; and say which weekdays count. */
  setDaily(goal: number | undefined, weekdays: readonly Weekday[]): boolean {
    if (goal !== undefined && !isGoalNumber(goal)) return false;
    this.goals = { ...this.goals, goal, weekdays: [...weekdays] };
    this.changed = true;
    return true;
  }

  /** Start a sprint of `target` words. `false` when the target is not allowed. */
  startSprint(target: number): boolean {
    const started = startSprint(target);
    if (started === undefined) return false;
    this.sprint = started;
    return true;
  }

  endSprint(): void {
    this.sprint = undefined;
  }

  /** The goals as they would be written. */
  data(): Goals {
    return this.goals;
  }

  /** Whether there is anything not yet written to the file. */
  get dirty(): boolean {
    return this.changed;
  }

  /** The file has been written with what `data()` returned. */
  clean(): void {
    this.changed = false;
  }

  /** A write failed: what it held is still to be written. */
  unclean(): void {
    this.changed = true;
  }

  view(totalWords: number): GoalsView {
    const today = this.today();
    const { goal, weekdays } = this.goals;
    const written = wordsOn(this.goals, today);
    const { current, best } = streaks(this.goals, today);
    const countsToday = counts(this.goals, today);
    return {
      totalWords,
      today: written,
      goal,
      weekdays,
      countsToday,
      streak: current,
      bestStreak: best,
      chart: chartDays(this.goals, today),
      sprint: this.sprint === undefined ? undefined : { target: this.sprint.target, written: sprintWritten(this.sprint) },
      pill: this.pill(written, countsToday),
    };
  }

  private pill(written: number, countsToday: boolean): GoalPill | undefined {
    // A sprint in progress takes the pill over from the day, whatever day it is.
    if (this.sprint !== undefined) {
      return {
        text: `${said(sprintWritten(this.sprint))} / ${said(this.sprint.target)} sprint`,
        kind: "sprint",
        state: "progress",
      };
    }
    const { goal } = this.goals;
    if (goal === undefined || !countsToday) return undefined;
    return {
      text: `${said(written)} / ${said(goal)} today`,
      kind: "daily",
      state: written > goal ? "exceeded" : written === goal ? "met" : "progress",
    };
  }
}
