/**
 * The title page layout (slice 2, step 6): the one list of positioned runs the
 * preview draws and the PDF's first page prints.
 */
import { describe, expect, it } from "vitest";
import { CHARACTER_INCHES, PAGE } from "../../src/screenplay/geometry.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { SHEET_POINTS, titlePageRuns } from "../../src/screenplay/title-page-layout.ts";

const runs = (fountain: string) => titlePageRuns(parse(fountain).titlePage);
const advance = CHARACTER_INCHES * 72;

describe("the title page's placements (#62)", () => {
  const big = runs(
    [
      "Title: Big Fish",
      "Credit: written by",
      "Author: John August",
      "Source: based on the novel by Daniel Wallace",
      "Notes:",
      "\tFINAL",
      "\tDRAFT",
      "Copyright: (c) 2003 Columbia Pictures",
      "",
      "x",
    ].join("\n"),
  );
  const of = (text: string) => big.find((run) => run.text === text)!;

  it("centres Title, Credit, Author and Source on their baselines", () => {
    for (const [text, y] of [
      ["Big Fish", 261],
      ["written by", 309],
      ["John August", 333],
      ["based on the novel by Daniel Wallace", 393],
    ] as const) {
      const run = of(text);
      expect(run.y).toBe(y);
      expect(run.x + (text.length * advance) / 2).toBeCloseTo(SHEET_POINTS.width / 2, 1);
    }
  });

  it("right-aligns Notes to 7.5in, a line per leading", () => {
    expect(of("FINAL").y).toBe(585);
    expect(of("DRAFT").y).toBe(585 + PAGE.leadingPoints);
    for (const text of ["FINAL", "DRAFT"]) {
      expect(of(text).x + text.length * advance).toBeCloseTo(540, 1);
    }
  });

  it("sets Copyright and Contact at 1.0in", () => {
    expect(of("(c) 2003 Columbia Pictures")).toMatchObject({ x: 72, y: 645 });
    const contact = runs("Contact:\n\tA\n\tB\n\nx");
    expect(contact.map((run) => [run.x, run.y])).toEqual([
      [72, 645],
      [72, 657],
    ]);
  });

  it("stacks keys it has no row for at the top of the page", () => {
    const stacked = runs("Draft date: today\nRevision: Blue\n\nx");
    expect(stacked.map((run) => [run.text, run.y])).toEqual([
      ["today", 81],
      ["Blue", 93],
    ]);
  });
});

describe("faces", () => {
  it("splits a line where its marks change, each run at its own character", () => {
    const found = runs("Title: _**BRICK** steel_\n\nx");
    expect(found.map((run) => [run.text, run.bold, run.underline])).toEqual([
      ["BRICK", true, true],
      [" steel", false, true],
    ]);
    expect(found[1]!.x - found[0]!.x).toBeCloseTo(5 * advance, 1);
  });
});

it("is a pure function of the fields: the same call twice gives the same list", () => {
  const fields = parse("Title: a\nAuthor: b\n\nx").titlePage;
  expect(titlePageRuns(fields)).toEqual(titlePageRuns(fields));
  expect(titlePageRuns([])).toEqual([]);
});
