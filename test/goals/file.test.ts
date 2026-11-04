/** `goals.md` (ADR-0040, ADR-0025): the goal and the days, and the rule about files that cannot be read. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseGoals, readGoals, serialiseGoals, writeGoals } from "../../src/goals/file.ts";
import { NO_GOALS, type Goals } from "../../src/goals/history.ts";
import { GOALS_FILE, type Project } from "../../src/project/bundle.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
beforeEach(() => {
  temporary = temporaryDirectory();
});
afterEach(() => temporary.remove());
const project = (): Project => ({ path: temporary.path, marker: { name: "Big Fish" } }) as Project;

const held: Goals = {
  goal: 500,
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  days: new Map([
    ["2026-11-03", 320],
    ["2026-11-02", 640],
    ["2026-11-01", -12],
  ]),
};

describe("the text of goals.md", () => {
  it("is a heading, a labelled header, and one line a day in date order", () => {
    expect(serialiseGoals(held)).toBe(
      [
        "# Goals",
        "",
        "Daily goal: 500",
        "Days: Mon, Tue, Wed, Thu, Fri",
        "",
        "## Words written",
        "",
        "- 2026-11-01: -12",
        "- 2026-11-02: 640",
        "- 2026-11-03: 320",
        "",
      ].join("\n"),
    );
  });

  it("reads back to what was written, and writes back to the same bytes", () => {
    const text = serialiseGoals(held);
    const parsed = parseGoals(text);
    expect(parsed.goal).toBe(500);
    expect(parsed.weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect([...parsed.days]).toEqual(expect.arrayContaining([...held.days]));
    expect(serialiseGoals(parsed)).toBe(text);
  });

  it("says off and none in words, and reads them", () => {
    const text = serialiseGoals({ goal: undefined, weekdays: [], days: new Map() });
    expect(text).toContain("Daily goal: off");
    expect(text).toContain("Days: none");
    expect(parseGoals(text)).toMatchObject({ goal: undefined, weekdays: [] });
  });

  it("keeps the weekdays in the week's order whatever order they were picked in", () => {
    expect(serialiseGoals({ ...held, weekdays: ["Sun", "Mon"] })).toContain("Days: Mon, Sun");
  });

  it("refuses what it cannot read, rather than reading it as no goal", () => {
    expect(() => parseGoals("Daily goal: 500\nDays: Mon\n")).toThrow(/Goals/);
    expect(() => parseGoals("# Goals\n\nDaily goal: lots\nDays: Mon\n")).toThrow(/lots/);
    expect(() => parseGoals("# Goals\n\nDaily goal: 0\nDays: Mon\n")).toThrow();
    expect(() => parseGoals("# Goals\n\nDaily goal: 5\nDays: Someday\n")).toThrow(/Someday/);
    expect(() => parseGoals("# Goals\n\nDaily goal: 5\n")).toThrow(/missing/);
    expect(() => parseGoals("# Goals\n\nDaily goal: 5\nDays: Mon\n\n- 2026-02-30: 4\n")).toThrow(/date/);
  });
});

describe("the file in the bundle", () => {
  it("is absent for a project that never had a goal, and reads as none", async () => {
    expect(await readGoals(nodeFilesystem, project())).toBe(NO_GOALS);
    expect(readdirSync(temporary.path)).toEqual([]);
  });

  it("is written whole and read back", async () => {
    await writeGoals(nodeFilesystem, project(), held);
    expect(readFileSync(join(temporary.path, GOALS_FILE), "utf8")).toBe(serialiseGoals(held));
    expect(readdirSync(temporary.path)).toEqual([GOALS_FILE]);
    expect((await readGoals(nodeFilesystem, project())).goal).toBe(500);
  });

  it("rejects when it is there and is not readable, and is left as it was", async () => {
    writeFileSync(join(temporary.path, GOALS_FILE), new Uint8Array([0xff, 0xfe, 0xfd]));
    await expect(readGoals(nodeFilesystem, project())).rejects.toThrow();
    writeFileSync(join(temporary.path, GOALS_FILE), "my own notes\n");
    await expect(readGoals(nodeFilesystem, project())).rejects.toThrow(/Goals/);
    expect(readFileSync(join(temporary.path, GOALS_FILE), "utf8")).toBe("my own notes\n");
  });
});
