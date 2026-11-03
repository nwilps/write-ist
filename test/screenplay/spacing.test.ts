/**
 * The spacing table: the vertical half of the page's geometry (ADR-0038).
 *
 * The paper and the PDF read one table keyed by the pair of element types
 * either side of a gap. The Fountain file's own blank-line rule
 * (`needsBlankLine`, ADR-0019) is a different thing and is not tested here.
 */
import { describe, expect, it } from "vitest";
import type { Element, ElementType, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { SPACING, gapBetween, gapLines, type SpacingRule } from "../../src/screenplay/geometry.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { paginate } from "../../src/screenplay/paginate.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";
import { withSpacing } from "../support/spacing.ts";

const el = (type: ElementType, text: string, extra: Partial<Element> = {}): Element => ({
  type,
  text,
  forced: false,
  ...extra,
});

const documentOf = (elements: Element[]): ScreenplayDocument => ({
  titlePage: [],
  elements,
  comments: [],
  endsWithNewline: true,
});

describe("the spacing table's defaults (Final Draft's template)", () => {
  it.each<[ElementType, ElementType, number]>([
    ["action", "scene-heading", 2],
    ["dialogue", "scene-heading", 2],
    ["scene-heading", "scene-heading", 2],
    ["scene-heading", "action", 1],
    ["action", "action", 1],
    ["action", "character", 1],
    ["action", "transition", 1],
    ["dialogue", "transition", 1],
    ["character", "dialogue", 0],
    ["character", "parenthetical", 0],
    ["parenthetical", "dialogue", 0],
    ["dialogue", "dialogue", 0],
    ["dialogue", "action", 1],
    ["lyrics", "lyrics", 0],
    ["boneyard-start", "scene-heading", 0],
    ["action", "boneyard-end", 0],
  ])("%s then %s leaves %i blank lines", (above, below, blank) => {
    expect(gapBetween(above, below).blank).toBe(blank);
  });

  it("allows exactly action→action and centered→centered to be squished", () => {
    const squishable = SPACING.filter((rule) => rule.squishable).map((r) => `${r.above}>${r.below}`);
    expect(squishable.sort()).toEqual(["action>action", "centered>centered"]);
    expect(gapBetween("action", "action").squishable).toBe(true);
    expect(gapBetween("centered", "centered").squishable).toBe(true);
    expect(gapBetween("action", "dialogue").squishable).toBe(false);
  });

  it("squishing takes a squishable gap to nothing and leaves other gaps alone", () => {
    expect(gapLines("action", "action", true)).toBe(0);
    expect(gapLines("action", "action", false)).toBe(1);
    expect(gapLines("action", "scene-heading", true)).toBe(2);
  });
});

describe("pagination reads the table, whatever the blank count", () => {
  // Two one-line actions: the second sits `blank` rows below the first's row.
  it.each([0, 1, 2, 3, 7])("a gap of %i blank lines puts that many rows between", (blank) => {
    const rows = rowsOfTwoActions(blank);
    expect(rows[1]! - rows[0]!).toBe(1 + blank);
  });

  it("a scene heading is two blank lines below the action before it", () => {
    const detail = paginate(documentOf([el("action", "Hi."), el("scene-heading", "INT. ROOM - DAY")]));
    const [first, second] = detail.chunks;
    expect(second!.row - first!.row).toBe(3);
  });

  it("the paper's layout and the PDF place the same rows", () => {
    const doc = documentOf([el("action", "One."), el("scene-heading", "INT. ROOM - DAY"), el("action", "Two.")]);
    const rows = layout(doc).pages[0]!.lines.map((line) => line.row);
    expect(rows).toEqual([0, 3, 5]);
    const baselines = pdfPagesOf(doc).pages[0]!.map((run) => run.y);
    expect(baselines).toEqual([81, 81 + 36, 81 + 60]);
  });

  it("the PDF follows a gap of three, and a squished one, row for row with the paper", () => {
    const three: SpacingRule = { above: "action", below: "action", blank: 3, squishable: true };
    const doc = documentOf([
      el("action", "One."),
      el("action", "Two."),
      el("action", "Three.", { squished: true }),
    ]);
    const [paper, pdf] = withSpacing([three], () => [
      layout(doc).pages[0]!.lines.map((line) => line.row),
      pdfPagesOf(doc).pages[0]!.map((run) => (run.y - 81) / 12),
    ]);
    expect(paper).toEqual([0, 4, 5]);
    expect(pdf).toEqual(paper);
  });

  it("a squished action pair has no gap", () => {
    const doc = documentOf([el("action", "One."), el("action", "Two.", { squished: true })]);
    const [a, b] = paginate(doc).chunks;
    expect(b!.row - a!.row).toBe(1);
  });

  it("a squished flag on a pair the table does not allow is ignored", () => {
    const doc = documentOf([el("action", "One."), el("scene-heading", "INT. A - DAY", { squished: true })]);
    const [a, b] = paginate(doc).chunks;
    expect(b!.row - a!.row).toBe(3);
  });
});

/** Rows of two one-line actions with `blank` blank lines between, by editing the table. */
function rowsOfTwoActions(blank: number): number[] {
  const row: SpacingRule = { above: "action", below: "action", blank, squishable: true };
  return withSpacing([row], () =>
    paginate(documentOf([el("action", "One."), el("action", "Two.")])).chunks.map((c) => c.row),
  );
}
