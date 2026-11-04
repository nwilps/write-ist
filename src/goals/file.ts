/**
 * `goals.md` — a project's daily goal and the days it has been written against
 * (ADR-0040, ADR-0025).
 *
 * It sits in the bundle so that the goal, and the streak that is read from it,
 * travel with the script. The shape is ADR-0025's for every sidecar file: a
 * heading, a short labelled header, then the records.
 *
 *   # Goals
 *
 *   Daily goal: 500
 *   Days: Mon, Tue, Wed, Thu, Fri
 *
 *   ## Words written
 *
 *   - 2026-11-02: 420
 *   - 2026-11-03: -12
 *
 * `Daily goal` is a number or `off`. `Days` lists the weekdays that count, or
 * `none`. A day's number is signed, because it is words added minus words cut
 * and a writer partway through moving a passage is below nought for a moment;
 * it is never *shown* below nought.
 *
 * ADR-0008 rule 3 holds: an absent file is a project with no goal; one that is
 * there and cannot be read **rejects**, so the caller can refuse to write over
 * it. Lines the file does not understand are ignored, so a writer's own note
 * in it survives a read — but only until the next write, which is rewritten
 * whole. It is bookkeeping, not prose.
 */
import { GOALS_FILE, type Project } from "../project/bundle.ts";
import { join, type Filesystem } from "../project/filesystem.ts";
import { isDay, WEEKDAYS, type Weekday } from "./day.ts";
import { isGoalNumber, NO_GOALS, type Goals } from "./history.ts";

const HEADING = "# Goals";
const DAYS_HEADING = "## Words written";

/** The text of a `goals.md`. */
export function serialiseGoals(goals: Goals): string {
  const days = [...goals.days]
    .filter(([, words]) => words !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, words]) => `- ${day}: ${words}`);
  // In the week's order whatever order they were chosen in, so the file is stable.
  const weekdays = WEEKDAYS.filter((day) => goals.weekdays.includes(day));
  return [
    HEADING,
    "",
    `Daily goal: ${goals.goal === undefined ? "off" : goals.goal}`,
    `Days: ${weekdays.length === 0 ? "none" : weekdays.join(", ")}`,
    "",
    DAYS_HEADING,
    "",
    ...days,
    ...(days.length === 0 ? [] : [""]),
  ].join("\n");
}

/** Read a `goals.md`, or throw because it is not one. */
export function parseGoals(text: string): Goals {
  const lines = text.split(/\r\n?|\n/);
  if (!lines.some((line) => line.trim() === HEADING)) throw new Error("it has no “# Goals” heading.");

  let goal: number | undefined;
  let weekdays: readonly Weekday[] = NO_GOALS.weekdays;
  const days = new Map<string, number>();
  let sawGoal = false;
  let sawDays = false;

  for (const line of lines) {
    const label = /^(Daily goal|Days):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (label !== null) {
      const value = label[2]!;
      if (label[1] === "Daily goal") {
        sawGoal = true;
        if (value.toLowerCase() === "off") goal = undefined;
        else if (/^\d+$/.test(value) && isGoalNumber(Number(value))) goal = Number(value);
        else throw new Error(`“Daily goal: ${value}” is not a number of words or “off”.`);
      } else {
        sawDays = true;
        const names = value.toLowerCase() === "none" ? [] : value.split(/[ \t]*,[ \t]*/);
        const found: Weekday[] = [];
        for (const name of names) {
          const known = WEEKDAYS.find((day) => day === name);
          if (known === undefined) throw new Error(`“${name}” is not a weekday.`);
          if (!found.includes(known)) found.push(known);
        }
        weekdays = found;
      }
      continue;
    }
    const record = /^-[ \t]+(\d{4}-\d{2}-\d{2}):[ \t]*(-?\d+)[ \t]*$/.exec(line);
    if (record !== null) {
      if (!isDay(record[1]!)) throw new Error(`“${record[1]}” is not a date.`);
      days.set(record[1]!, Number(record[2]));
    }
  }
  if (!sawGoal || !sawDays) throw new Error("its “Daily goal” or “Days” line is missing.");
  return { goal, weekdays, days };
}

/** What the project's goals file holds; no goal and no days when there is no file. */
export async function readGoals(filesystem: Filesystem, project: Project): Promise<Goals> {
  const path = join(project.path, GOALS_FILE);
  if (!(await filesystem.exists(path))) return NO_GOALS;
  const bytes = await filesystem.readFile(path);
  return parseGoals(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

/** Write the goals, whole or not at all (temp, flush, rename). */
export async function writeGoals(filesystem: Filesystem, project: Project, goals: Goals): Promise<void> {
  await filesystem.writeFile(join(project.path, GOALS_FILE), new TextEncoder().encode(serialiseGoals(goals)));
}
