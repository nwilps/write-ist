/**
 * The three numberings of the editor's document, through the one module that
 * owns them.
 *
 * - a **position** in the document (ProseMirror's),
 * - an element's number **on the paper** (blank lines counted, title page not),
 * - an element's number **in the manuscript** (blank lines omitted, ADR-0019).
 *
 * Positions are written out from the node sizes, not borrowed from the module,
 * so a wrong answer cannot hide behind the arithmetic that produced it.
 */
import { describe, expect, it } from "vitest";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { toEditorDocument } from "../../src/screenplay/editor.ts";
import {
  elementAt,
  manuscriptElementAt,
  manuscriptElements,
  manuscriptIndex,
  paperIndex,
  positionOfElement,
  startOfManuscriptElement,
  type ManuscriptIndex,
  type PaperIndex,
} from "../../src/screenplay/numbering.ts";

const screenplay: ScreenplayDocument = {
  titlePage: [{ key: "Title", inline: { text: "Hi" }, continuations: [] }],
  elements: [
    { type: "action", text: "Go", forced: false },
    { type: "action", text: "", forced: false },
    { type: "character", text: "EDWARD", forced: false },
    { type: "action", text: "", forced: false },
    { type: "dialogue", text: "Hello.", forced: false },
  ],
  comments: [],
  endsWithNewline: false,
};

describe("the manuscript's elements, walked once", () => {
  const doc = toEditorDocument(screenplay);
  // title "Hi" is 4 tokens; "Go" 4; blank 2; "EDWARD" 8; blank 2; "Hello." 8.
  const go = 4;
  const edward = go + 4 + 2;
  const hello = edward + 8 + 2;

  it("lists the elements that are in the file, with where each begins", () => {
    const found = manuscriptElements(doc);
    expect(found.map((e) => [e.index, e.pos, e.node.textContent])).toEqual([
      [0, go, "Go"],
      [1, edward, "EDWARD"],
      [2, hello, "Hello."],
    ]);
  });

  it("answers from the same walk every time it is asked of the same document", () => {
    expect(manuscriptElements(doc)).toBe(manuscriptElements(doc));
    expect(manuscriptElements(toEditorDocument(screenplay))).not.toBe(manuscriptElements(doc));
  });

  it("says where a manuscript element begins, and refuses one that is not there", () => {
    expect(startOfManuscriptElement(doc, manuscriptIndex(1))).toBe(edward);
    expect(startOfManuscriptElement(doc, manuscriptIndex(3))).toBeUndefined();
  });

  it("hears the manuscript element before a blank line, and none from the title page", () => {
    expect(manuscriptElementAt(doc, 1)).toBeUndefined();
    expect(manuscriptElementAt(doc, go + 4 + 1)).toBe(0); // the first blank
    expect(manuscriptElementAt(doc, edward + 8 + 1)).toBe(1); // the second
    expect(manuscriptElementAt(doc, hello + 1)).toBe(2);
  });
});

describe("the numberings cannot be mixed", () => {
  const doc = toEditorDocument(screenplay);

  it("keeps the paper's number and the manuscript's number apart in the type", () => {
    const paper: PaperIndex = paperIndex(2);
    const manuscript: ManuscriptIndex = manuscriptIndex(1);
    // @ts-expect-error a manuscript element is not an element on the paper
    const asPaper: PaperIndex = manuscript;
    // @ts-expect-error nor the other way round
    const asManuscript: ManuscriptIndex = paper;
    // @ts-expect-error a bare number is neither until it is named at a boundary
    startOfManuscriptElement(doc, 1);
    // @ts-expect-error the paper's number does not find a manuscript element
    startOfManuscriptElement(doc, paper);
    // @ts-expect-error the manuscript's number does not find a spot on the paper
    positionOfElement(doc, manuscript, 0);
    expect([asPaper, asManuscript]).toEqual([1, 2]); // they are numbers at runtime
  });

  it("answers an element on the paper in the paper's number", () => {
    // Element 2 on the paper is the blank before "EDWARD"... counting "Go" 0, blank 1, EDWARD 2.
    const at = elementAt(doc, 4 + 4 + 2 + 1);
    expect(at).toEqual({ element: 2, offset: 0, type: "character" });
    expect(positionOfElement(doc, paperIndex(2), 3)).toBe(4 + 4 + 2 + 1 + 3);
  });
});
