/**
 * A click in the paper's left or right margin puts the caret on the line
 * beside it (Noah): the left margin at the **start** of that line, the right
 * margin at its **end**. With Shift held it carries the selection there.
 *
 * The margins are the paper's own inset around the writing — `.page`'s padding,
 * outside the manuscript — not the desk beside the paper. A click on the
 * writing is ProseMirror's, as before, and a click in the top or bottom inset
 * does what it did (nothing).
 *
 * **Any zoom.** The click and the writing's edges are both read in the
 * window's own coordinates, the ones ProseMirror's `posAtCoords` takes, so
 * the paper drawn larger or smaller (`paper-zoom.ts`) changes the numbers and
 * not the answer.
 */
import { Selection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** Which margin a point is in, given the writing's left and right edges; `undefined` for neither. */
export function marginAt(x: number, writing: { readonly left: number; readonly right: number }): "start" | "end" | undefined {
  if (x < writing.left) return "start";
  if (x > writing.right) return "end";
  return undefined;
}

/**
 * The point inside the writing to ask ProseMirror about: just inside the
 * margin's own edge, on the clicked line, held within the writing's top and
 * bottom.
 */
export function pointInside(
  side: "start" | "end",
  y: number,
  writing: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
): { readonly left: number; readonly top: number } {
  return {
    left: side === "start" ? writing.left + 1 : writing.right - 1,
    top: Math.min(Math.max(y, writing.top + 1), writing.bottom - 1),
  };
}

/** Hear clicks in the margins of `paper` and move `view`'s caret for them. Answers how to stop. */
export function caretFromMargins(paper: HTMLElement, view: () => EditorView | undefined): () => void {
  const pressed = (event: MouseEvent): void => {
    const editing = view();
    // Only the paper's own inset: anything inside the manuscript is ProseMirror's.
    if (editing === undefined || event.button !== 0 || event.target !== paper) return;
    const writing = editing.dom.getBoundingClientRect();
    const side = marginAt(event.clientX, writing);
    if (side === undefined) return;
    const found = editing.posAtCoords(pointInside(side, event.clientY, writing));
    if (found === null) return;
    event.preventDefault();
    const { doc, selection } = editing.state;
    const caret = Selection.near(doc.resolve(found.pos), side === "start" ? 1 : -1);
    const placed = event.shiftKey ? TextSelection.between(selection.$anchor, caret.$head) : caret;
    editing.dispatch(editing.state.tr.setSelection(placed).scrollIntoView());
    editing.focus();
  };
  paper.addEventListener("mousedown", pressed);
  return () => paper.removeEventListener("mousedown", pressed);
}
