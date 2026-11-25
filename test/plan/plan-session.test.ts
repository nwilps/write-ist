/**
 * A plan open for working on, with no window (`src/plan/plan-session.ts`):
 * cards made, moved, coloured and lengthened are saved to `plan.md` and read
 * back as they were; the grid follows the project's target page count without
 * rewriting a card; and a `plan.md` that is not a plan is never written over.
 * Real files in a temporary folder; an invented project.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "../../src/project/bundle.ts";
import { PLAN_FILE, planSession, readPlan } from "../../src/plan/plan-session.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

let temporary: { path: string; remove: () => void };
let project: Project;
beforeEach(() => {
  temporary = temporaryDirectory();
  const path = join(temporary.path, "Paper Boats");
  mkdirSync(path, { recursive: true });
  project = { path, marker: { name: "Paper Boats", projectId: "id-paper-boats" } } as Project;
});
afterEach(() => temporary.remove());

const planPath = () => join(project.path, PLAN_FILE);

async function open(targetPages: number) {
  const status: string[] = [];
  const session = planSession(
    {
      filesystem: nodeFilesystem,
      project,
      targetPages,
      report: () => {},
      setSaved: () => {},
      setStatus: (text) => void status.push(text),
      whenSwitchedAway: () => () => {},
      whenSwitchedBack: () => () => {},
      redraw: () => {},
    },
    await readPlan(nodeFilesystem, project),
  );
  return { session, status };
}

const placedOf = (session: Awaited<ReturnType<typeof open>>["session"], id: string) =>
  session.layout().placed.find((each) => each.card.id === id)!;

describe("cards", () => {
  it("are saved to plan.md and read back as they were", async () => {
    const { session, status } = await open(100);
    const id = session.add(24, 2)!;
    session.setTitle(id, "The ferry at night");
    session.setDescription(id, "They cross without lights.");
    session.setColour(id, "blue");
    expect(status.at(-1)).toBe("1 card");
    expect(await session.leave()).toBe(true);

    const text = readFileSync(planPath(), "utf8");
    expect(text).toContain("## The ferry at night");
    expect(text).toContain("Colour: blue");
    expect(text).toContain("Starts at: 24%");

    const again = (await open(100)).session;
    const card = placedOf(again, id);
    expect([card.cell, card.lane, card.cells]).toEqual([24, 2, 2]);
    expect(card.card).toMatchObject({ title: "The ferry at night", description: "They cross without lights.", colour: "blue" });
  });

  it("move to a free square, and not onto another card", async () => {
    const { session } = await open(100);
    const one = session.add(10, 0)!;
    const two = session.add(20, 0)!;
    expect(session.move(one, 40, 3)).toBe(true);
    expect([placedOf(session, one).cell, placedOf(session, one).lane]).toEqual([40, 3]);
    expect(session.move(one, 19, 0)).toBe(false);
    expect([placedOf(session, one).cell, placedOf(session, one).lane]).toEqual([40, 3]);
    expect(session.resize(two, 5)).toBe(true);
    expect(placedOf(session, two).cells).toBe(5);
    await session.save();
    expect(readFileSync(planPath(), "utf8")).toContain("Lane: 4\nStarts at: 40%");
  });

  it("are made, moved and coloured one undoable step at a time", async () => {
    const { session } = await open(100);
    const id = session.add(10, 0)!;
    session.move(id, 12, 1);
    session.setColour(id, "red");
    expect(session.undo()).toBe(true);
    expect(placedOf(session, id).card.colour).toBe("plain");
    expect(session.undo()).toBe(true);
    expect(placedOf(session, id).cell).toBe(10);
    expect(session.redo()).toBe(true);
    expect(placedOf(session, id).cell).toBe(12);
    expect(session.undo() && session.undo()).toBe(true);
    expect(session.plan().cards).toEqual([]);
  });

  it("are deleted", async () => {
    const { session } = await open(100);
    const id = session.add(10, 0)!;
    session.remove(id);
    expect(session.plan().cards).toEqual([]);
  });
});

describe("the target page count", () => {
  it("resizes the grid, and the cards keep their place in the whole, nothing rewritten", async () => {
    const { session } = await open(110);
    const id = session.add(55, 0)!;
    expect(await session.leave()).toBe(true);
    const before = readFileSync(planPath(), "utf8");

    const again = (await open(110)).session;
    again.setTargetPages(90);
    expect(again.layout().length).toBe(90);
    expect(placedOf(again, id).cell).toBe(45);
    again.setTargetPages(0);
    expect(again.layout().length).toBe(100);
    expect(placedOf(again, id).cell).toBe(50);
    expect(again.unsaved()).toBe(false);
    expect(await again.leave()).toBe(true);
    expect(readFileSync(planPath(), "utf8")).toBe(before);
  });
});

describe("a plan.md that is not a plan", () => {
  it("is refused when read, and so never opened for writing over", async () => {
    writeFileSync(planPath(), "a shopping list, not a plan");
    await expect(readPlan(nodeFilesystem, project)).rejects.toThrow(/not a plan Write-ist can read/);
    expect(readFileSync(planPath(), "utf8")).toBe("a shopping list, not a plan");
  });
});
