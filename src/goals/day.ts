/**
 * The writer's day, for goals (ADR-0040).
 *
 * A day is a calendar date **in the writer's own time zone**, ending at a time
 * the writer will one day choose. That is not the ledger's day: the ledger
 * dates a line in UTC so that one Instant makes one line on every machine
 * (`ledger.ts`), but a daily goal that rolled over at four in the afternoon
 * because the box is in Sydney would be a goal nobody could keep.
 *
 * **Day ends at is the application's, not a project's.** It is one setting
 * for the whole app, so it is one function here — `dayEndsAt()` — and a
 * settings page, when there is one, changes what that returns. Nothing else in
 * the goals reads a time of day. Until then it answers midnight.
 *
 * Days travel as `YYYY-MM-DD` strings and are counted in whole days with UTC
 * arithmetic, which has no daylight-saving hour in it to lose a day in.
 */

/** A time of day, 24-hour. */
export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/** Midnight: where a day ends until the writer says otherwise. */
export const DEFAULT_DAY_ENDS_AT: TimeOfDay = { hour: 0, minute: 0 };

/** Where the writer's day ends. The one place a settings page will plug in. */
export function dayEndsAt(): TimeOfDay {
  return DEFAULT_DAY_ENDS_AT;
}

/** The days of the week the writer can count, Monday first. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The writer's day that `when` falls in, as `YYYY-MM-DD`.
 *
 * With a day that ends at midnight this is the local date. With one that ends
 * at 04:00, 03:59 still belongs to the day before.
 */
export function writingDayOf(when: Date, ends: TimeOfDay = dayEndsAt()): string {
  const shifted = new Date(
    when.getFullYear(),
    when.getMonth(),
    when.getDate(),
    when.getHours() - ends.hour,
    when.getMinutes() - ends.minute,
  );
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether text is a real calendar day in `YYYY-MM-DD`. */
export function isDay(text: string): boolean {
  const found = DAY.exec(text);
  if (found === null) return false;
  const date = new Date(Date.UTC(Number(found[1]), Number(found[2]) - 1, Number(found[3])));
  return toDay(date) === text;
}

function toDay(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function fromDay(day: string): Date {
  const found = DAY.exec(day);
  if (found === null) throw new Error(`"${day}" is not a day.`);
  return new Date(Date.UTC(Number(found[1]), Number(found[2]) - 1, Number(found[3])));
}

/** The day `count` days after `day` (before, if negative). */
export function addDays(day: string, count: number): string {
  const date = fromDay(day);
  date.setUTCDate(date.getUTCDate() + count);
  return toDay(date);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDay(to).getTime() - fromDay(from).getTime()) / 86_400_000);
}

/** Which weekday a day falls on. */
export function weekdayOf(day: string): Weekday {
  // getUTCDay counts from Sunday; the writer's week starts on Monday.
  return WEEKDAYS[(fromDay(day).getUTCDay() + 6) % 7]!;
}
