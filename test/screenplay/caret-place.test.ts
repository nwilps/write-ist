/**
 * Where the caret is, in the manuscript's own terms, so it can be kept
 * between one opening of a project and the next.
 */
import { describe, expect, it } from "vitest";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { caretPlaceOf, selectionAtPlace } from "../../src/screenplay/caret-place.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { startOfElement } from "../support/editor-positions.ts";

const SCRIPT = `INT. KITCHEN - DAY

He waits.

STEEL
Hello.
`;

describe("the caret's place", () => {
  const state = editorStateFor(parse(SCRIPT));
  const steel = startOfElement(state, 2);
  const hello = startOfElement(state, 3);

  it("names the element and the offset inside it, not a raw position", () => {
    const place = caretPlaceOf(state.doc, steel + 2);
    expect(place).toEqual({ element: 2, offset: 2, elements: 4 });
    const restored = selectionAtPlace(state.doc, place!);
    expect(restored?.head).toBe(steel + 2);
  });

  it("round-trips the top of the script, which is where a new project starts", () => {
    const head = state.selection.head;
    const place = caretPlaceOf(state.doc, head);
    expect(place?.element).toBe(0);
    expect(place?.offset).toBe(0);
    expect(selectionAtPlace(state.doc, place!)?.head).toBe(head);
  });

  it("still lands in the same line after a line is added later in the script", () => {
    const place = caretPlaceOf(state.doc, hello + 3)!;
    const longer = editorStateFor(parse(`${SCRIPT}\nShe leaves.\n`));
    const restored = selectionAtPlace(longer.doc, place);
    expect(restored?.head).toBe(startOfElement(longer, 3) + 3);
  });

  it("clamps an offset that is now past the end of the line", () => {
    const shorter = editorStateFor(parse("INT. KITCHEN - DAY\n\nHi.\n"));
    const restored = selectionAtPlace(shorter.doc, { element: 1, offset: 20, elements: 2 });
    expect(restored?.head).toBe(startOfElement(shorter, 1) + 3);
  });

  it("is not used when that element is gone, or when it would land on a hidden page break", () => {
    expect(selectionAtPlace(state.doc, { element: 9, offset: 0, elements: 4 })).toBeUndefined();
    const broken = editorStateFor(parse("A line above.\n\n====\n\nINT. KITCHEN - DAY\n"));
    expect(selectionAtPlace(broken.doc, { element: 1, offset: 0, elements: 3 })).toBeUndefined();
  });
});
