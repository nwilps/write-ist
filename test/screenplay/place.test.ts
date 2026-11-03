/**
 * Which element a spot on the paper is, in both numberings.
 *
 * The positions below are written out from the node sizes, not borrowed from
 * `numbering.ts`, so a wrong answer cannot hide behind the arithmetic that produced
 * it (`test/support/editor-positions.ts` is the same rule).
 */
import { describe, expect, it } from "vitest";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { toEditorDocument } from "../../src/screenplay/editor.ts";
import {
  elementAt,
  manuscriptElementAt,
  paperIndex,
  positionOfElement,
} from "../../src/screenplay/numbering.ts";
import { elementUnder, sceneAt } from "../../src/screenplay/place.ts";

const screenplay: ScreenplayDocument = {
  titlePage: [{ key: "Title", inline: { text: "Hi" }, continuations: [] }],
  elements: [
    { type: "action", text: "Go", forced: false },
    { type: "action", text: "", forced: false },
    { type: "character", text: "EDWARD", forced: false },
  ],
  comments: [],
  endsWithNewline: false,
};

describe("where a spot is", () => {
  const doc = toEditorDocument(screenplay);

  // title "Hi" (2) + element "Go" (2) + empty element + "EDWARD" (6).
  // A textblock's size is its text plus the two tokens around it.
  const title = 0;
  const go = doc.child(0).nodeSize;
  const blank = go + doc.child(1).nodeSize;
  const edward = blank + doc.child(2).nodeSize;

  it("lays the fixture out as the positions assume", () => {
    expect(doc.child(0).type.name).toBe("title_line");
    expect(doc.child(0).textContent).toBe("Hi");
    expect(doc.child(1).textContent).toBe("Go");
    expect(doc.child(2).textContent).toBe("");
    expect(doc.child(3).textContent).toBe("EDWARD");
    expect(doc.child(0).nodeSize).toBe(4);
    expect(doc.child(2).nodeSize).toBe(2);
    expect(edward).toBe(10);
  });

  it("does not count the title page as an element", () => {
    expect(elementAt(doc, title + 1)).toBeUndefined();
    expect(manuscriptElementAt(doc, title + 1)).toBeUndefined();
  });

  it("counts a blank line on the page and skips it in the manuscript", () => {
    expect(elementAt(doc, go + 1)).toEqual({ element: 0, offset: 0, type: "action" });
    expect(manuscriptElementAt(doc, go + 1)).toBe(0);

    // The caret standing on the blank. On the page it is element 1. In the
    // manuscript it is not an element, so the page count hears the one before.
    expect(elementAt(doc, blank + 1)).toEqual({ element: 1, offset: 0, type: "action" });
    expect(manuscriptElementAt(doc, blank + 1)).toBe(0);

    expect(elementAt(doc, edward + 1)).toEqual({ element: 2, offset: 0, type: "character" });
    expect(manuscriptElementAt(doc, edward + 1)).toBe(1);
  });

  it("round-trips an offset inside a cue", () => {
    // E D W A R D — offset 3 is the second A.
    const position = positionOfElement(doc, paperIndex(2), 3);
    expect(position).toBe(edward + 1 + 3);
    expect(elementAt(doc, position!)).toEqual({ element: 2, offset: 3, type: "character" });
  });

  it("refuses an offset past the text, and an element that is not there", () => {
    expect(positionOfElement(doc, paperIndex(2), 7)).toBeUndefined();
    expect(positionOfElement(doc, paperIndex(3), 0)).toBeUndefined();
  });

  it("reports 0 when the first element on the page is blank", () => {
    const leadingBlank = toEditorDocument({
      ...screenplay,
      titlePage: [],
      elements: [
        { type: "action", text: "", forced: false },
        { type: "character", text: "EDWARD", forced: false },
      ],
    });
    expect(manuscriptElementAt(leadingBlank, 1)).toBe(0);
    expect(elementAt(leadingBlank, 1)).toEqual({ element: 0, offset: 0, type: "action" });
    const cue = positionOfElement(leadingBlank, paperIndex(1), 0);
    expect(manuscriptElementAt(leadingBlank, cue!)).toBe(0);
    expect(elementAt(leadingBlank, cue!)).toEqual({ element: 1, offset: 0, type: "character" });
  });
});

describe("what the caret is in, and which scene", () => {
  const scripted: ScreenplayDocument = {
    titlePage: [{ key: "Title", inline: { text: "Hi" }, continuations: [] }],
    elements: [
      { type: "action", text: "Before.", forced: false },
      { type: "scene-heading", text: "INT. KITCHEN - DAY", forced: false },
      { type: "action", text: "", forced: false },
      { type: "character", text: "EDWARD", forced: false },
      { type: "scene-heading", text: "EXT. YARD - NIGHT", forced: false, omitted: true },
      { type: "dialogue", text: "Hello.", forced: false },
      { type: "scene-heading", text: "INT. HALL - DAY", forced: false },
    ],
    comments: [],
    endsWithNewline: true,
  };
  const doc = toEditorDocument(scripted);
  const start = (element: number): number => {
    let at = 0;
    for (let i = 0; i < 1 + element; i++) at += doc.child(i).nodeSize;
    return at + 1;
  };

  it("reports the element under the caret with its text", () => {
    expect(elementUnder(doc, start(3) + 2)).toEqual({
      element: 3, offset: 2, type: "character", text: "EDWARD", omitted: false,
    });
    expect(elementUnder(doc, start(4))?.omitted).toBe(true);
    expect(elementUnder(doc, 1)).toBeUndefined();
  });

  it("finds the scene around the caret in the page's numbering", () => {
    expect(sceneAt(doc, start(0))).toEqual({ heading: undefined, start: 0, end: 1 });
    expect(sceneAt(doc, start(3))).toEqual({ heading: 1, start: 1, end: 6 });
    // The heading in the boneyard begins nothing: its scene is the one around it.
    expect(sceneAt(doc, start(5))).toEqual({ heading: 1, start: 1, end: 6 });
    expect(sceneAt(doc, start(6))).toEqual({ heading: 6, start: 6, end: 7 });
    expect(sceneAt(doc, 1)).toBeUndefined();
  });
});
