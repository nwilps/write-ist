/**
 * Writing goals through the manuscript session (ADR-0040): what counts as a
 * word written, what must not, and what survives the project closing.
 *
 * Real files in a temporary folder, a driven autosave clock and a clock the
 * test sets, as in `manuscript-session.test.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TextSelection } from "prosemirror-state";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOALS_FILE, MANUSCRIPT_FILE } from "../../src/project/bundle.ts";
import type { Clock } from "../../src/project/autosave.ts";
import { importProject } from "../../src/project/import.ts";
import {
  manuscriptSession,
  readManuscript,
  type ManuscriptSession,
} from "../../src/project/manuscript-session.ts";
import { openProject, type OpenedProject } from "../../src/project/open.ts";
import type { GoalPill } from "../../src/goals/tracker.ts";
import { manuscriptOf } from "../../src/screenplay/editing.ts";
import { setTitlePage, titlePageOf } from "../../src/screenplay/title-page-editing.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

let temporary: { path: string; remove: () => void };
beforeEach(() => {
  temporary = temporaryDirectory();
});
afterEach(() => temporary.remove());

const TUESDAY_EVENING = new Date(2026, 10, 3, 21, 0);

async function aProject(fixture = "Brick-&-Steel.fountain"): Promise<OpenedProject> {
  const source = join(temporary.path, fixture);
  writeFileSync(source, readFixtureBytes(fixture));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  return openProject(nodeFilesystem, imported.project);
}

interface Made {
  readonly session: ManuscriptSession;
  readonly reports: string[];
  readonly pills: (GoalPill | undefined)[];
  readonly opened: OpenedProject;
  readonly clock: { now: Date };
}

async function aSession(opened?: OpenedProject, clock = { now: TUESDAY_EVENING }): Promise<Made> {
  const project = opened ?? (await aProject());
  const reports: string[] = [];
  const pills: (GoalPill | undefined)[] = [];
  // The pause is never run unless a test runs it: leaving writes the file.
  const quiet: Clock = { wait: (run) => run, cancel: () => {} };
  const ports = {
    filesystem: nodeFilesystem,
    project: project.project,
    report: (text: string) => reports.push(text),
    setSaved: () => {},
    setStatus: () => {},
    setGoal: (pill: GoalPill | undefined) => pills.push(pill),
    instant: { now: () => clock.now },
    ledger: () => undefined,
    whenSwitchedAway: () => () => {},
    whenSwitchedBack: () => () => {},
    spellEngine: fakeEngine(),
    drawSeam: () => ({}) as HTMLElement,
    drawOffer: () => ({}) as HTMLElement,
    reloaded: () => {},
    autosaveClock: quiet,
  };
  const read = await readManuscript(nodeFilesystem, ports.project, ports.report);
  return { session: manuscriptSession(ports, read), reports, pills, opened: project, clock };
}

const wordsOf = (text: string): number => (text.trim() === "" ? 0 : text.trim().split(/\s+/).length);

/** Put `text` at the start of the n'th element, as typing or pasting would. */
function insertAt(session: ManuscriptSession, index: number, text: string): void {
  const at = startOfElement(session.state, index);
  session.apply(session.state.tr.setSelection(TextSelection.create(session.state.doc, at)).insertText(text));
}

/** An element with plenty of words in it, to cut and move. */
function longElement(session: ManuscriptSession): number {
  // Past the first few, which the tests type into.
  const found = manuscriptOf(session.state.doc).elements.findIndex((element, at) => at > 8 && wordsOf(element.text) > 4);
  expect(found).toBeGreaterThan(8);
  return found;
}

/** Delete all the text of the n'th element, as a cut would. Answers what was cut. */
function cut(session: ManuscriptSession, index: number): string {
  const text = manuscriptOf(session.state.doc).elements[index]!.text;
  const from = startOfElement(session.state, index);
  session.apply(session.state.tr.delete(from, from + text.length));
  return text;
}

describe("opening a project", () => {
  it("has written nothing today, whatever the manuscript holds", async () => {
    const { session, pills } = await aSession();
    expect(session.goalsView().totalWords).toBeGreaterThan(100);
    expect(session.goalsView().today).toBe(0);
    expect(session.goalsView().pill).toBeUndefined();
    expect(pills).toEqual([]);
  });
});

describe("words written", () => {
  it("count what is typed", async () => {
    const { session } = await aSession();
    const before = session.goalsView().totalWords;
    insertAt(session, 3, "alpha beta gamma ");
    expect(session.goalsView().today).toBe(3);
    expect(session.goalsView().totalWords).toBe(before + 3);
  });

  it("do not count moving text within the project: cut here, paste there", async () => {
    const { session } = await aSession();
    insertAt(session, 3, "alpha beta gamma ");
    const written = session.goalsView().today;
    const moved = cut(session, longElement(session));
    expect(wordsOf(moved)).toBeGreaterThan(2);
    insertAt(session, 40, `${moved} `);
    expect(session.goalsView().today).toBe(written);
  });

  it("do not count a passage moved on a day with nothing else written", async () => {
    const { session } = await aSession();
    const moved = cut(session, longElement(session));
    expect(session.goalsView().today).toBe(0);
    insertAt(session, 40, `${moved} `);
    expect(session.goalsView().today).toBe(0);
  });

  it("are net of what is cut, and never below zero", async () => {
    const { session } = await aSession();
    insertAt(session, 3, "alpha beta ");
    const cutWords = wordsOf(cut(session, longElement(session)));
    expect(cutWords).toBeGreaterThan(2);
    expect(session.goalsView().today).toBe(0);
  });

  it("are taken back by undoing", async () => {
    const { session } = await aSession();
    insertAt(session, 3, "alpha beta gamma ");
    expect(session.goalsView().today).toBe(3);
    session.apply(session.state.tr.delete(startOfElement(session.state, 3), startOfElement(session.state, 3) + 17));
    expect(session.goalsView().today).toBe(0);
  });

  it("do not count editing the title page", async () => {
    const { session } = await aSession();
    const titlePage = titlePageOf(session.state.doc);
    session.apply(
      setTitlePage(session.state, [...titlePage, { key: "Notes", inline: { text: " a good many words here", marks: [] }, continuations: [] }]),
    );
    expect(session.goalsView().today).toBe(0);
  });

  it("do not count another program's version loading", async () => {
    const { session, opened } = await aSession();
    writeFileSync(join(opened.project.path, MANUSCRIPT_FILE), readFixtureBytes("Big-Fish-augmented.fountain"));
    await session.save();
    expect(session.goalsView().totalWords).toBeGreaterThan(10_000);
    expect(session.goalsView().today).toBe(0);
    // And counting goes on from the new words, not from the old.
    insertAt(session, 3, "alpha beta ");
    expect(session.goalsView().today).toBe(2);
  });
});

describe("the Goal pill", () => {
  it("follows the day's words once a goal is set", async () => {
    const { session, pills } = await aSession();
    expect(session.setDailyGoal(10, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).toBe(true);
    expect(pills.at(-1)?.text).toBe("0 / 10 today");
    insertAt(session, 3, "one two three four five ");
    expect(pills.at(-1)).toEqual({ text: "5 / 10 today", kind: "daily", state: "progress" });
    insertAt(session, 5, "six seven eight nine ten eleven ");
    expect(pills.at(-1)).toEqual({ text: "11 / 10 today", kind: "daily", state: "exceeded" });
  });

  it("shows a sprint, and the day's pill returns when it ends", async () => {
    const { session, pills } = await aSession();
    session.setDailyGoal(1000, ["Tue"]);
    expect(session.startSprint(49)).toBe(false);
    expect(session.startSprint(50)).toBe(true);
    insertAt(session, 3, "one two three ");
    expect(pills.at(-1)?.text).toBe("3 / 50 sprint");
    session.endSprint();
    expect(pills.at(-1)?.text).toBe("3 / 1,000 today");
  });

  it("is hidden when the goal is turned off", async () => {
    const { session, pills } = await aSession();
    session.setDailyGoal(10, ["Tue"]);
    session.setDailyGoal(undefined, ["Tue"]);
    expect(pills.at(-1)).toBeUndefined();
  });
});

describe("persistence", () => {
  it("writes the goal and the day's words into the project on leaving, and reads them back", async () => {
    const first = await aSession();
    first.session.setDailyGoal(250, ["Mon", "Tue", "Wed"]);
    insertAt(first.session, 3, "one two three four ");
    expect(await first.session.leave()).toBe(true);

    const text = readFileSync(join(first.opened.project.path, GOALS_FILE), "utf8");
    expect(text).toContain("Daily goal: 250");
    expect(text).toContain("Days: Mon, Tue, Wed");
    expect(text).toContain("- 2026-11-03: 4");

    const second = await aSession(first.opened);
    expect(second.session.goalsView()).toMatchObject({ goal: 250, weekdays: ["Mon", "Tue", "Wed"], today: 4 });
    insertAt(second.session, 3, "five ");
    expect(second.session.goalsView().today).toBe(5);
  });

  it("keeps each day separately, and the streak reads across a restart", async () => {
    const first = await aSession();
    first.session.setDailyGoal(2, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    insertAt(first.session, 3, "one two ");
    await first.session.leave();

    const next = await aSession(first.opened, { now: new Date(2026, 10, 4, 9, 0) });
    expect(next.session.goalsView().today).toBe(0);
    insertAt(next.session, 3, "one two three ");
    const view = next.session.goalsView();
    expect(view.streak).toBe(2);
    expect(view.bestStreak).toBe(2);
    expect(view.chart.at(-2)).toMatchObject({ day: "2026-11-03", words: 2, met: true });
  });

  it("is written a pause after a change, like the manuscript", async () => {
    const pending: (() => void)[] = [];
    const project = await aProject();
    // The pause is driven, to see the write happen.
    const reports: string[] = [];
    const clock: Clock = { wait: (run) => (pending.push(run), run), cancel: () => {} };
    const read = await readManuscript(nodeFilesystem, project.project, (t) => reports.push(t));
    const session = manuscriptSession(
      {
        filesystem: nodeFilesystem, project: project.project, report: (t) => reports.push(t), setSaved: () => {},
        setStatus: () => {}, setGoal: () => {}, instant: { now: () => TUESDAY_EVENING }, ledger: () => undefined,
        whenSwitchedAway: () => () => {}, whenSwitchedBack: () => () => {}, spellEngine: fakeEngine(),
        drawSeam: () => ({}) as HTMLElement, drawOffer: () => ({}) as HTMLElement, reloaded: () => {},
        autosaveClock: clock,
      },
      read,
    );
    insertAt(session, 3, "one two ");
    pending.forEach((run) => run());
    await session.settled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readFileSync(join(project.project.path, GOALS_FILE), "utf8")).toContain("- 2026-11-03: 2");
  });

  it("writes nothing for a project that never had a goal and wrote no words", async () => {
    const { session, opened } = await aSession();
    await session.leave();
    expect(() => readFileSync(join(opened.project.path, GOALS_FILE))).toThrow();
  });

  it("says a goals file it cannot read, and leaves it exactly as it was", async () => {
    const opened = await aProject();
    writeFileSync(join(opened.project.path, GOALS_FILE), "my own notes\n");
    const { session, reports } = await aSession(opened);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain("could not read this project's goals");
    session.setDailyGoal(10, ["Mon"]);
    insertAt(session, 3, "one two ");
    expect(session.goalsView().today).toBe(2); // still counted for this session
    expect(await session.leave()).toBe(true);
    expect(readFileSync(join(opened.project.path, GOALS_FILE), "utf8")).toBe("my own notes\n");
  });

  it("still lets the project leave when the goals could not be written, and says so once", async () => {
    const opened = await aProject();
    const failing = {
      ...nodeFilesystem,
      writeFile: (path: string, bytes: Uint8Array) =>
        path.endsWith(GOALS_FILE) ? Promise.reject(new Error("the disk is full")) : nodeFilesystem.writeFile(path, bytes),
    };
    const reports: string[] = [];
    const read = await readManuscript(failing, opened.project, (t) => reports.push(t));
    const session = manuscriptSession(
      {
        filesystem: failing, project: opened.project, report: (t) => reports.push(t), setSaved: () => {},
        setStatus: () => {}, setGoal: () => {}, instant: { now: () => TUESDAY_EVENING }, ledger: () => undefined,
        whenSwitchedAway: () => () => {}, whenSwitchedBack: () => () => {}, spellEngine: fakeEngine(),
        drawSeam: () => ({}) as HTMLElement, drawOffer: () => ({}) as HTMLElement, reloaded: () => {},
        autosaveClock: { wait: (run) => run, cancel: () => {} },
      },
      read,
    );
    insertAt(session, 3, "one two ");
    expect(await session.leave()).toBe(true);
    const said = reports.filter((report) => report.includes("writing goals"));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("could not save your writing goals");
    expect(said[0]).toContain("the disk is full");
  });
});
