/**
 * Where an element's text starts in the editor's document.
 *
 * **The tests do their own arithmetic rather than borrowing the editor's**, so
 * a bug in the editor's cannot hide itself behind the test that would catch it.
 * It lives here rather than in each test file because the walk is the same
 * walk, and two copies of it would be two things to keep right.
 *
 * Position 1 is not the answer: a screenplay with a title page has its lines
 * before the elements (`src/screenplay/schema.ts`), so a test that assumed
 * otherwise would be typing into the title rather than into the manuscript.
 */
import type { EditorState } from "prosemirror-state";

export function startOfElement(state: EditorState, element: number): number {
  let at = 0;
  let index = 0;
  let found: number | undefined;
  state.doc.forEach((child) => {
    if (child.type.name === "element") {
      if (index === element) found = at + 1;
      index++;
    }
    at += child.nodeSize;
  });
  if (found === undefined) throw new Error(`the document has no element ${element}`);
  return found;
}
