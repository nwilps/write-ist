/**
 * How far in from the window's top and bottom the caret is kept while the
 * writer types or moves with the arrows.
 *
 * ProseMirror's own default is a few pixels, which leaves the caret against the edge —
 * and here the edge is not the edge: the paper fades out over its last
 * `--size-paper-fade`, under the workspace bar at the top and the pills at the
 * foot. So the caret is kept clear of the fade and then five lines further in,
 * the way other editors keep a margin of text around the line being written.
 * Not a typewriter: inside the margin, the paper does not move.
 *
 * In a window too short for that, the margin gives way to a third of what is
 * visible, so the caret always has the middle of the window to sit in.
 *
 * ## Why the caret is measured here and not by ProseMirror
 *
 * ProseMirror measures the far side of the caret. Where a line wraps, that is
 * the start of the next line while the caret is still drawn at the end of this
 * one, so the paper moved for a line the writer had not reached. This measures
 * the side the caret is on, and moves the paper at most once for it.
 */
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** Lines of paper kept clear between the caret and the fade. */
export const COMFORT_LINES = 5;

/** Lines further in that the caret is left after the paper has moved. */
export const SETTLE_LINES = 1;

/** ProseMirror's own margin at the sides, which this leaves as it was. */
const SIDE_MARGIN = 5;

export interface Measures {
  /** The height of the paper fade, in pixels. */
  readonly fade: number;
  /** One line of the manuscript, in pixels. */
  readonly line: number;
  /** The height of the window the paper scrolls in, in pixels. */
  readonly visible: number;
}

/** The distance from the window's edge at which the paper starts to move, in pixels. */
export function caretMargin({ fade, line, visible }: Measures): number {
  const wanted = fade + COMFORT_LINES * line;
  return Math.round(Math.min(wanted, Math.max(fade, visible / 3)));
}

/**
 * The view's `scrollThreshold` and `scrollMargin`. The threshold is where the
 * paper starts to move; the margin, a line further in, is where that leaves the
 * caret, so the next keystroke is not already on the trigger. The sides are left
 * alone.
 */
export function caretScrolling(measures: Measures): {
  readonly scrollMargin: { top: number; bottom: number; left: number; right: number };
  readonly scrollThreshold: { top: number; bottom: number; left: number; right: number };
} {
  const threshold = caretMargin(measures);
  const margin = threshold + Math.round(SETTLE_LINES * measures.line);
  return {
    scrollMargin: { top: margin, bottom: margin, left: SIDE_MARGIN, right: SIDE_MARGIN },
    scrollThreshold: { top: threshold, bottom: threshold, left: 0, right: 0 },
  };
}

/** A stretch of the window along one axis, in pixels. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * How far the paper should move for a caret, along one axis: nothing while the
 * caret is inside the threshold, and otherwise enough to leave it at the margin.
 *
 * Both distances stop at the middle of the window, so where a move leaves the
 * caret is never past the opposite threshold. That is what keeps a short window
 * from answering one scroll with another the other way.
 */
export function scrollFor(caret: Span, visible: Span, threshold: number, margin: number): number {
  const middle = Math.max(0, (visible.end - visible.start - (caret.end - caret.start)) / 2);
  const trigger = Math.min(threshold, middle);
  const landing = Math.min(margin, middle);
  let move = 0;
  if (caret.start < visible.start + trigger) move = caret.start - (visible.start + landing);
  else if (caret.end > visible.end - trigger) move = caret.end - (visible.end - landing);
  // Less than a pixel is rounding in the measurement, not a caret that moved.
  return Math.abs(move) < 1 ? 0 : move;
}

/**
 * The view's `handleScrollToSelection`, and what puts the caret on screen when a
 * project opens. Answers whether it dealt with the selection; a selection that
 * is not text is left to ProseMirror.
 */
export function scrollCaretIntoView(view: EditorView): boolean {
  if (!(view.state.selection instanceof TextSelection)) return false;
  const scroller = scrollerOf(view.dom);
  if (scroller === undefined) return true;
  const threshold = view.someProp("scrollThreshold");
  const margin = view.someProp("scrollMargin");
  if (typeof threshold !== "object" || typeof margin !== "object") return false;

  const caret = caretRect(view);
  const box = scroller.getBoundingClientRect();
  const down = scrollFor(
    { start: caret.top, end: caret.bottom },
    { start: box.top, end: box.top + scroller.clientHeight },
    threshold.top,
    margin.top,
  );
  const across = scrollFor(
    { start: caret.left, end: caret.right },
    { start: box.left, end: box.left + scroller.clientWidth },
    threshold.left,
    margin.left,
  );
  if (down !== 0) scroller.scrollTop += down;
  if (across !== 0) scroller.scrollLeft += across;
  return true;
}

type CaretRect = ReturnType<EditorView["coordsAtPos"]>;

/**
 * Where the caret is drawn: the side of its position that holds the text it
 * follows, which at a wrap is the line it is still on. A selection dragged
 * backwards has its text on the other side.
 */
function caretRect(view: EditorView): CaretRect {
  const { head, anchor } = view.state.selection;
  const after = view.coordsAtPos(head, 1);
  if (head < anchor) return after;
  const before = view.coordsAtPos(head, -1);
  // More than a line apart is not a wrap: a sheet seam falls inside this
  // element, and the caret is drawn past it, on the new sheet.
  const line = before.bottom - before.top;
  return after.top - before.top > line * 1.5 ? after : before;
}

/** The nearest element around the manuscript that scrolls, if any does. */
export function scrollerOf(manuscript: HTMLElement): HTMLElement | undefined {
  const view = manuscript.ownerDocument.defaultView;
  for (let at = manuscript.parentElement; at !== null && view !== null; at = at.parentElement) {
    if (/auto|scroll/.test(view.getComputedStyle(at).overflowY)) return at;
  }
  return undefined;
}

/**
 * Keep the caret's line where it sits in the window while `change` redraws
 * the paper (a zoom), then keep the usual room around it. The paper grows or
 * shrinks about the caret's line rather than about the top of the script.
 *
 * **Up and down only.** Across, a zoom centres the paper (`centrePaper`), the
 * same way every time, wherever the caret was: following a caret near the
 * right margin slid the sheet off-centre, so that only one panel showed, cut
 * off.
 */
export function holdCaretWhile(view: EditorView, change: () => void): void {
  const scroller = view.state.selection instanceof TextSelection ? scrollerOf(view.dom) : undefined;
  const before = scroller === undefined ? undefined : caretRect(view);
  change();
  if (scroller === undefined || before === undefined) return;
  scroller.scrollTop += caretRect(view).top - before.top;
  scrollCaretIntoView(view);
}

/**
 * Scroll sideways so the paper's middle is the window's middle. Where the
 * window cannot scroll that far, it scrolls as far as it can, which is the
 * same thing: the desk centres the paper itself, so this undoes any sideways
 * scroll there was.
 */
export function centrePaper(paper: HTMLElement, scroller: HTMLElement): void {
  const sheet = paper.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  scroller.scrollLeft += sheet.left + sheet.width / 2 - (box.left + scroller.clientWidth / 2);
}

/**
 * The measures as the window has them now. `zoom` is how large the paper is
 * drawn (1 is 100%): the stylesheet's line is the paper's own, and the window
 * sees it that much larger or smaller.
 */
export function measureCaretRoom(manuscript: HTMLElement, zoom = 1): Measures {
  const view = manuscript.ownerDocument.defaultView;
  const fade = pixels(
    view === null ? "" : view.getComputedStyle(manuscript.ownerDocument.documentElement).getPropertyValue("--size-paper-fade"),
  );
  const style = view?.getComputedStyle(manuscript);
  const fontSize = pixels(style?.fontSize ?? "");
  // `normal` is the face's own leading; about 1.2 of the size for Courier Prime.
  const line = pixels(style?.lineHeight ?? "") || fontSize * 1.2;
  return { fade, line: line * zoom, visible: view?.innerHeight ?? 0 };
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
