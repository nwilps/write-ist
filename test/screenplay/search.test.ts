/**
 * Find in the manuscript: what it finds, where it says it is, and what it
 * leaves out (the desk design, §2.5).
 *
 * The script is invented. Positions are written out from the node sizes rather
 * than borrowed from the code under test (see `place.test.ts`).
 */
import { describe, expect, it } from "vitest";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { toEditorDocument } from "../../src/screenplay/editor.ts";
import { findInManuscript, SHOWN } from "../../src/screenplay/search.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { pageAtElement } from "../../src/screenplay/paginate.ts";

const screenplay: ScreenplayDocument = {
  titlePage: [{ key: "Title", inline: { text: "Maya Lane" }, continuations: [] }],
  elements: [
    { type: "scene-heading", text: "INT. KITCHEN - NIGHT", forced: true },
    { type: "action", text: "", forced: false },
    {
      type: "action",
      text: "Maya sits. A maya-shaped gap.",
      forced: false,
      marks: [{ mark: "bold", start: 0, end: 4 }],
    },
    { type: "character", text: "MAYA", forced: false },
    { type: "dialogue", text: "Hello.", forced: false },
  ],
  comments: [],
  endsWithNewline: false,
};
const doc = toEditorDocument(screenplay);

describe("find in the manuscript", () => {
  it("finds every occurrence, ignoring case, in reading order", () => {
    const found = findInManuscript(doc, "maya");
    expect(found.total).toBe(3);
    expect(found.matches.map((m) => [m.offset, m.length])).toEqual([
      [0, 4],
      [13, 4],
      [0, 4],
    ]);
  });

  it("gives document positions that hold the matched text", () => {
    for (const match of findInManuscript(doc, "maya").matches) {
      expect(doc.textBetween(match.from, match.to).toLowerCase()).toBe("maya");
    }
  });

  it("numbers elements the manuscript's way: the blank line is not one", () => {
    const found = findInManuscript(doc, "maya");
    // heading 0, (blank), action 1, character 2.
    expect(found.matches.map((m) => m.manuscriptElement)).toEqual([1, 1, 2]);
  });

  it("agrees with the layout about the page", () => {
    const laid = layout(screenplay);
    const found = findInManuscript(doc, "hello");
    expect(found.total).toBe(1);
    expect(pageAtElement(laid.pagination, found.matches[0]!.manuscriptElement)).toBe(1);
  });

  it("does not search the title page", () => {
    expect(findInManuscript(doc, "lane").total).toBe(0);
  });

  it("does not see the syntax the writer does not see", () => {
    expect(findInManuscript(doc, "**").total).toBe(0);
    expect(findInManuscript(doc, "[[").total).toBe(0);
  });

  it("finds across a mark, because the mark is not in the text", () => {
    expect(findInManuscript(doc, "maya sits").total).toBe(1);
  });

  it("finds nothing for an empty query", () => {
    expect(findInManuscript(doc, "")).toEqual({ total: 0, matches: [] });
  });

  it("counts every match but lists only so many", () => {
    const many: ScreenplayDocument = {
      ...screenplay,
      elements: Array.from({ length: SHOWN + 25 }, () => ({
        type: "action" as const,
        text: "go",
        forced: false,
      })),
    };
    const found = findInManuscript(toEditorDocument(many), "go");
    expect(found.total).toBe(SHOWN + 25);
    expect(found.matches).toHaveLength(SHOWN);
  });
});
