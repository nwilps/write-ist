/**
 * Where a spot in the editor's document falls among the elements.
 *
 * Two numbers, and they are not the same number (`docs/STANDARDS.md`: the
 * visual index and the model index). Both are answered here so a caller cannot
 * keep its own copy.
 *
 * - **On the page.** Title-page lines are not elements. A blank line is an
 *   element while the writer is standing on it — deleting a line's text leaves
 *   one, and the caret has to have somewhere to be. Comment ends and paste use
 *   this numbering, because that is the document they are held on until
 *   `manuscriptOf` writes the file.
 * - **In the manuscript.** A blank line is spacing, not an element (ADR-0019).
 *   The page count uses this numbering, because it counts the manuscript
 *   `manuscriptOf` would save. A blank line reports the manuscript element
 *   before it, or 0 when it is the first thing on the page.
 *
 * `resolve` walks the document's depth rather than its length, so asking which
 * element a spot is costs the same on a hundred elements and on three thousand.
 * The manuscript numbering does walk the elements before the spot — the page
 * count asks once per keystroke, which is the walk it already did.
 */
import type { Node as EditorNode } from "prosemirror-model";
import type { ElementType } from "./document.ts";

/** A spot that falls inside an element on the page. */
export interface ElementAt {
  /** Among element lines, blank lines counted, the title page not counted. */
  readonly element: number;
  /** Offset within that element's text. */
  readonly offset: number;
  readonly type: ElementType;
}

/**
 * The element containing `position`, or undefined when the spot is on the
 * title page or between elements.
 */
export function elementAt(doc: EditorNode, position: number): ElementAt | undefined {
  const at = doc.resolve(position);
  if (at.depth !== 1 || at.parent.type.name !== "element") return undefined;
  const type = at.parent.attrs["type"];
  if (typeof type !== "string") return undefined;
  return {
    element: at.index(0) - leadingTitleLines(doc),
    offset: at.parentOffset,
    type: type as ElementType,
  };
}

/**
 * The document position of `offset` within element `element` (blank lines
 * counted, the title page not counted). Undefined when there is no such
 * element, or the offset runs past its text.
 */
export function positionOfElement(
  doc: EditorNode,
  element: number,
  offset: number,
): number | undefined {
  let seen = 0;
  let at = 0;
  let start: number | undefined;
  doc.forEach((child) => {
    if (start === undefined && child.type.name === "element") {
      if (seen === element) start = at + 1;
      seen += 1;
    }
    at += child.nodeSize;
  });
  if (start === undefined) return undefined;
  const node = doc.nodeAt(start - 1);
  if (node === undefined || node === null || offset > node.content.size) return undefined;
  return start + offset;
}

/**
 * Which manuscript element `position` belongs to, blank lines omitted.
 *
 * Undefined on the title page. A blank line is not in the manuscript, so the
 * answer is the manuscript element before it — or 0, when nothing precedes it.
 * That is the index `repaginate` already expects.
 */
export function manuscriptElementAt(doc: EditorNode, position: number): number | undefined {
  const place = elementAt(doc, position);
  if (place === undefined) return undefined;

  const titleLines = leadingTitleLines(doc);
  let manuscript = 0;
  for (let i = 0; i < place.element; i++) {
    if (doc.child(titleLines + i)!.textContent !== "") manuscript += 1;
  }
  if (doc.child(titleLines + place.element)!.textContent === "") {
    return manuscript > 0 ? manuscript - 1 : 0;
  }
  return manuscript;
}

/** How many title-page lines the document opens with. They come first. */
function leadingTitleLines(doc: EditorNode): number {
  let lines = 0;
  while (lines < doc.childCount && doc.child(lines).type.name === "title_line") lines += 1;
  return lines;
}
