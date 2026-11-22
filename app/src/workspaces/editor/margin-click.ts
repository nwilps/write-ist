/**
 * A click in the paper's left or right margin puts the caret on the line
 * beside it (Noah): the left margin at the **start** of that line, the right
 * margin at its **end**. With Shift held it carries the selection there.
 *
 * **A line is a line as drawn**, not an element. Where action or dialogue
 * wraps, a click beside its second line goes to the start or the end of that
 * second line, and not of the whole element.
 *
 * The margins are the paper's own inset around the writing — `.page`'s padding,
 * outside the manuscript — not the desk beside the paper. A click on the
 * writing is ProseMirror's, as before, and a click in the top or bottom inset
 * does what it did (nothing).
 *
 * ## How the line is found
 *
 * Asking ProseMirror what is at the writing's edge did not work: every element
 * but action is indented, so a point at the writing's left edge is beside
 * dialogue and not in it, and the answer was the start or the end of the whole
 * speech; and at a wrap, the position at the end of a line is the same one as
 * at the start of the next, and the caret there is drawn on the next. So the
 * element is found by height (`elementBeside`), and the line in it by where the
 * caret would be drawn at each position (`lineBeside`). The end of a wrapped
 * line is the position before the wrap, which is drawn on the line clicked.
 *
 * **Any zoom.** The click, the elements and the caret are all measured in the
 * window's own coordinates, so the paper drawn larger or smaller
 * (`paper-zoom.ts`) changes the numbers and not the answer.
 */
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** A box in the window, in pixels. */
export interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Which margin a point is in, given the writing's left and right edges; `undefined` for neither. */
export function marginAt(x: number, writing: { readonly left: number; readonly right: number }): "start" | "end" | undefined {
  if (x < writing.left) return "start";
  if (x > writing.right) return "end";
  return undefined;
}

/**
 * Which of `count` elements, in order, a click at height `y` in the `side`
 * margin is beside. `boxOf` answers each one's box, or `undefined` for one that
 * is not drawn (the title page, a forced page break). Beside two at that height
 * (dual dialogue), the left margin takes the left one and the right margin the
 * right one. Between elements, the nearer; halfway, the one above.
 */
export function elementBeside(
  boxOf: (index: number) => Box | undefined,
  count: number,
  y: number,
  side: "start" | "end",
): number | undefined {
  let best: { index: number; distance: number; left: number } | undefined;
  for (let index = 0; index < count; index++) {
    const box = boxOf(index);
    if (box === undefined) continue;
    const distance = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    const across = side === "start" ? box.left : -box.right;
    if (best === undefined || distance < best.distance || (distance === 0 && best.distance === 0 && across < best.left)) {
      best = { index, distance, left: across };
    }
  }
  return best?.index;
}

/**
 * The line as drawn that height `y` is on, in a textblock whose text runs from
 * `from` to `to`: the first position on it and the last. `drawn` answers where
 * the caret at a position is drawn, line by line in order down the element.
 *
 * At a wrap the last position of a line is the one before the wrap, because
 * the caret at the wrap itself is drawn at the start of the next line.
 */
export function lineBeside(drawn: (pos: number) => Box, from: number, to: number, y: number): { start: number; end: number } {
  if (from >= to) return { start: from, end: from };
  const middle = (pos: number): number => {
    const box = drawn(pos);
    return (box.top + box.bottom) / 2;
  };
  /** The first position from `from` for which `past` holds, which once it holds holds to the end; `to + 1` if none. */
  const first = (past: (pos: number) => boolean): number => {
    let low = from;
    let high = to + 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (past(mid)) high = mid;
      else low = mid + 1;
    }
    return low;
  };
  const clicked = Math.min(to, first((pos) => drawn(pos).bottom > y));
  const line = drawn(clicked);
  const half = (line.bottom - line.top) / 2;
  const centre = (line.top + line.bottom) / 2;
  const start = first((pos) => middle(pos) > centre - half);
  const end = first((pos) => middle(pos) > centre + half) - 1;
  return { start: Math.min(start, to), end: Math.max(Math.min(start, to), Math.min(end, to)) };
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
    const y = Math.min(Math.max(event.clientY, writing.top + 1), writing.bottom - 1);
    const caret = caretBeside(editing, y, side);
    if (caret === undefined) return;
    event.preventDefault();
    const { doc, selection } = editing.state;
    const placed = event.shiftKey
      ? TextSelection.between(selection.$anchor, doc.resolve(caret))
      : TextSelection.create(doc, caret);
    editing.dispatch(editing.state.tr.setSelection(placed).scrollIntoView());
    editing.focus();
  };
  paper.addEventListener("mousedown", pressed);
  return () => paper.removeEventListener("mousedown", pressed);
}

/** The start (`start`) or the end (`end`) of the line drawn at height `y`, as a position in the document. */
function caretBeside(view: EditorView, y: number, side: "start" | "end"): number | undefined {
  const { doc } = view.state;
  const offsets: number[] = [];
  doc.forEach((_node, offset) => offsets.push(offset));
  const index = elementBeside(
    (at) => {
      const drawn = view.nodeDOM(offsets[at]!);
      if (!(drawn instanceof Element)) return undefined;
      const box = drawn.getBoundingClientRect();
      return box.width === 0 && box.height === 0 ? undefined : box;
    },
    offsets.length,
    y,
    side,
  );
  if (index === undefined) return undefined;
  const element = doc.child(index);
  if (!element.isTextblock) return undefined;
  const from = offsets[index]! + 1;
  const to = from + element.content.size;
  // The side the caret is drawn on: the text after it, and at the very end the text before.
  const line = lineBeside((pos) => view.coordsAtPos(pos, pos < to ? 1 : -1), from, to, y);
  return side === "start" ? line.start : line.end;
}
