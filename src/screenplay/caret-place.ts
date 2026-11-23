/**
 * Where the caret is, said in the manuscript's own terms rather than as a
 * ProseMirror position, so it can be kept between one opening of a project
 * and the next.
 *
 * A raw position counts the title page's lines and every element's edges, so
 * the same place is a different number as soon as the title page changes. The
 * element's index and the offset inside it are what a writer would say: the
 * fortieth line, eleven characters in. The number of elements is kept beside
 * them as a record of the script as it was. If that element is still there,
 * the caret goes back to it (an offset past the end is clamped). If the
 * element is gone, or it is a page break, the place is not used, and
 * the top of the script is the honest answer then.
 */
import { TextSelection } from "prosemirror-state";
import type { Node as EditorNode } from "prosemirror-model";
import { isPageBreak } from "./page-break-editing.ts";

export interface CaretPlace {
  /** Which element, counted from 0 among the elements (never the title page). */
  readonly element: number;
  /** How far into that element's text. */
  readonly offset: number;
  /** How many elements the script had when the place was kept. */
  readonly elements: number;
}

/** The place of a caret at `head`, or `undefined` when it is not in an element. */
export function caretPlaceOf(doc: EditorNode, head: number): CaretPlace | undefined {
  let at = 0;
  let index = 0;
  let found: CaretPlace | undefined;
  doc.forEach((child) => {
    if (child.type.name === "element") {
      const start = at + 1;
      if (found === undefined && head >= start && head <= start + child.content.size) {
        found = { element: index, offset: head - start, elements: 0 };
      }
      index++;
    }
    at += child.nodeSize;
  });
  return found === undefined ? undefined : { ...found, elements: index };
}

/**
 * A caret at a remembered place, or `undefined` when the place no longer makes
 * sense in this document — the element is gone, the offset is not a position,
 * or a page break, which a caret is never put back into. An offset past the end
 * of a line that is still there is clamped, so a shorter line does not throw
 * the writer to the top of the script.
 */
export function selectionAtPlace(doc: EditorNode, place: CaretPlace): TextSelection | undefined {
  if (!Number.isInteger(place.element) || place.element < 0 || !Number.isInteger(place.offset) || place.offset < 0) {
    return undefined;
  }
  let at = 0;
  let index = 0;
  let found: number | undefined;
  doc.forEach((child) => {
    if (child.type.name === "element") {
      if (index === place.element && !isPageBreak(child)) {
        found = at + 1 + Math.min(place.offset, child.content.size);
      }
      index++;
    }
    at += child.nodeSize;
  });
  return found === undefined ? undefined : TextSelection.create(doc, found);
}
