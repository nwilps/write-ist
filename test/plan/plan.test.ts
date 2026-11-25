/**
 * Plan's grid and its file (`src/plan/`): cards are kept as a share of the
 * whole, so the grid follows the project's target page count without losing a
 * card or crushing one; `plan.md` is a readable document that reads back as
 * the plan it was written from; and nothing in Plan refers to the manuscript
 * (ADR-0013). Invented plans only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LENGTH_WITHOUT_TARGET,
  fits,
  freeCardId,
  gridLength,
  layoutPlan,
  type Plan,
  type PlanCard,
} from "../../src/plan/plan.ts";
import { parsePlan, serialisePlan } from "../../src/plan/plan-file.ts";
import { STRUCTURE_SHEETS, layoutBeats } from "../../src/plan/structure.ts";

const card = (id: string, lane: number, start: number, length: number, extra: Partial<PlanCard> = {}): PlanCard => ({
  id,
  title: id,
  description: "",
  colour: "plain",
  lane,
  start,
  length,
  ...extra,
});

describe("the grid's length", () => {
  it("is the project's target page count, and a modest feature length when there is none", () => {
    expect(gridLength(110)).toBe(110);
    expect(gridLength(90)).toBe(90);
    expect(gridLength(0)).toBe(LENGTH_WITHOUT_TARGET);
    expect(LENGTH_WITHOUT_TARGET).toBe(100);
  });
});

describe("cards when the target page count changes", () => {
  const plan: Plan = {
    structure: [],
    cards: [card("card-1", 0, 0.25, 0.05), card("card-2", 0, 0.5, 0.02), card("card-3", 3, 0.9, 0.1)],
  };

  it("keep their place in the whole: a quarter of the way in is a quarter of the way in", () => {
    const at110 = layoutPlan(plan, 110);
    const at90 = layoutPlan(plan, 90);
    const first = (layout: typeof at110) => layout.placed.find((each) => each.card.id === "card-1")!;
    expect(first(at110).cell).toBe(28);
    expect(first(at90).cell).toBe(23);
    // The stored card is untouched by the change: only how it is drawn follows.
    expect(first(at90).card).toBe(plan.cards[0]);
  });

  it("never lose a card, and never draw one narrower than a cell, however short the grid", () => {
    for (const length of [1, 5, 20, 90, 110, 400]) {
      const layout = layoutPlan(plan, length);
      expect(layout.placed.map((each) => each.card.id)).toEqual(["card-1", "card-2", "card-3"]);
      for (const each of layout.placed) expect(each.cells).toBeGreaterThanOrEqual(1);
    }
  });

  it("never put two cards in a lane on top of each other: the later one moves along, and the grid grows to show it", () => {
    // Apart as stored (50–53% and 54–57%), together only once a short grid rounds them.
    const crowded: Plan = { structure: [], cards: [card("card-1", 0, 0.5, 0.03), card("card-2", 0, 0.54, 0.03)] };
    const short = layoutPlan(crowded, 10);
    const [one, two] = short.placed;
    expect(two!.cell).toBeGreaterThanOrEqual(one!.cell + one!.cells);
    const tail = layoutPlan({ structure: [], cards: [card("card-1", 0, 0.98, 0.02), card("card-2", 0, 0.99, 0.02)] }, 10);
    const last = tail.placed[1]!;
    expect(last.cell + last.cells).toBeGreaterThan(10);
    expect(tail.columns).toBeGreaterThanOrEqual(last.cell + last.cells);
    // A longer target puts them back where they were stored.
    const long = layoutPlan(crowded, 200);
    expect(long.placed.map((each) => each.cell)).toEqual([100, 108]);
  });

  it("know which squares are free", () => {
    const layout = layoutPlan(plan, 100);
    expect(fits(layout, 25, 0, 1)).toBe(false);
    expect(fits(layout, 25, 0, 1, "card-1")).toBe(true);
    expect(fits(layout, 25, 1, 3)).toBe(true);
    expect(fits(layout, -1, 1, 1)).toBe(false);
  });

  it("give a new card an id no card has", () => {
    expect(freeCardId(plan)).toBe("card-4");
    expect(freeCardId({ structure: [], cards: [] })).toBe("card-1");
  });
});

describe("structure sheets", () => {
  it("are kept as fractions of the whole, so a sheet holds its shape at any length", () => {
    for (const sheet of STRUCTURE_SHEETS) {
      for (const beat of sheet.beats) {
        expect(beat.at).toBeGreaterThanOrEqual(0);
        expect(beat.at).toBeLessThanOrEqual(1);
        if (beat.to !== undefined) expect(beat.to).toBeLessThanOrEqual(1);
      }
    }
    const midpoint = (length: number) =>
      layoutBeats(["save-the-cat"], length, () => 1).beats.find((beat) => beat.name === "Midpoint")!.cell;
    expect(midpoint(110)).toBe(55);
    expect(midpoint(90)).toBe(45);
  });

  it("stack one band under another, so one sheet's beats are never broken up by another's", () => {
    const track = layoutBeats(["save-the-cat", "story-circle"], 100, () => 4);
    const rowsOf = (sheet: string) => track.beats.filter((beat) => beat.sheet === sheet).map((beat) => beat.row);
    expect(Math.max(...rowsOf("save-the-cat"))).toBeLessThan(Math.min(...rowsOf("story-circle")));
  });
});

describe("plan.md", () => {
  const plan: Plan = {
    structure: ["save-the-cat"],
    cards: [
      card("card-3", 1, 0.225, 0.0375, {
        title: "The ferry at night",
        colour: "blue",
        description: "They cross without lights.\n# not a heading\n\\ a backslash",
      }),
      card("card-7", 0, 0, 0.02, { title: "" }),
    ],
  };

  it("is a readable document: a heading per card, a short labelled header, the writer's words under it", () => {
    expect(serialisePlan(plan)).toBe(
      [
        "# Plan",
        "",
        "Structure: save-the-cat",
        "",
        "## The ferry at night",
        "",
        "Card: card-3",
        "Colour: blue",
        "Lane: 2",
        "Starts at: 22.5%",
        "Length: 3.75%",
        "",
        "They cross without lights.",
        "\\# not a heading",
        "\\\\ a backslash",
        "",
        "##",
        "",
        "Card: card-7",
        "Lane: 1",
        "Starts at: 0%",
        "Length: 2%",
        "",
      ].join("\n"),
    );
  });

  it("reads back as the plan it was written from", () => {
    const read = parsePlan(serialisePlan(plan))!;
    expect(read.plan).toEqual(plan);
    expect(serialisePlan(read.plan, read)).toBe(serialisePlan(plan));
  });

  it("stores ids, never names, and keeps a header line it does not know", () => {
    const text = "# My plan\n\nStructure: save-the-cat\nMood: rainy\n\n## A\n\nCard: card-1\nLane: 1\nStarts at: 10%\nLength: 2%\n";
    const read = parsePlan(text)!;
    expect(read.heading).toBe("My plan");
    expect(read.extra).toEqual(["Mood: rainy"]);
    expect(serialisePlan(read.plan, read)).toBe(text);
  });

  it("puts right what it can — a missing or repeated id, a lane that is not a number — and refuses what is not a plan", () => {
    const read = parsePlan("# Plan\n\n## A\n\nCard: card-1\nLane: x\n\n## B\n\nCard: card-1\n")!;
    expect(read.plan.cards.map((each) => [each.id, each.lane])).toEqual([
      ["card-1", 0],
      ["card-2", 0],
    ]);
    expect(parsePlan("just some text, no heading")).toBeNull();
  });
});

describe("Plan and the manuscript (ADR-0013)", () => {
  it("imports nothing about screenplays, the manuscript or drafts", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const folders = ["src/plan", "app/src/workspaces/plan"];
    for (const folder of folders) {
      for (const name of readdirSync(join(root, folder)).filter((file) => file.endsWith(".ts"))) {
        const source = readFileSync(join(root, folder, name), "utf8");
        const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
        for (const path of imports) {
          expect(path, `${folder}/${name}`).not.toMatch(/screenplay|manuscript|editor|prose|fountain|draft|names/i);
        }
      }
    }
  });
});
