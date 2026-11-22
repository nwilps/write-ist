/**
 * Scroll so the caret's line sits in the middle of the window, smoothly: for a
 * **jump**, not for typing.
 *
 * Typing and the arrows keep the caret clear of the window's edges and move the
 * paper as little as they can (`caret-margin.ts`). A jump is different: the
 * writer has gone somewhere else in the script and wants to see it, with as
 * much above as below. So these centre the caret line:
 *
 * - a scene chosen in the Scenes panel (`panels.ts`);
 * - Previous Scene and Next Scene (`scene-jump.ts`);
 * - a search result (`editor.ts`);
 * - a project opening where the writer left it (`editor.ts`).
 *
 * **Not Undo or Redo.** Those put the caret back where an edit was, which is
 * usually on screen already; they keep the ordinary scrolling, so the paper
 * does not lurch with every Ctrl+Z.
 *
 * Near the top or the foot of the script there is not enough paper to centre
 * on, and the scroll stops where the window does: no space is invented.
 *
 * **Nothing may write a scroll position while the glide runs**, because any
 * write stops it where it is. The Editor's sideways centring once wrote on every
 * scroll event and stopped every jump a few pixels in (`centrePaper`); the
 * caret's own scrolling stands aside until the glide is over (`glideTo`).
 *
 * **Typewriter Mode, later.** A mode that keeps the line being written in the
 * middle of the window can call `centreCaretLine` after every edit (from the
 * view's `handleScrollToSelection`), with `smooth: false` so a fast typist is
 * not chasing an animation. It is not built; this is the helper it would use.
 */
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { caretRect, glideTo, scrollerOf, stopGlide } from "./caret-margin.ts";

/** What centring is measured from, all in pixels, in the window's coordinates. */
export interface CentreMeasures {
  /** The caret's line, top and bottom. */
  readonly caretTop: number;
  readonly caretBottom: number;
  /** The scroller's visible top, and how tall it is. */
  readonly viewTop: number;
  readonly viewHeight: number;
  /** How far it is scrolled now, and how far it could ever scroll in all. */
  readonly scrollTop: number;
  readonly scrollHeight: number;
}

/**
 * Where to scroll to so the caret's line is in the middle of what is visible,
 * held between the top of the script and its foot.
 */
export function centredScrollTop({ caretTop, caretBottom, viewTop, viewHeight, scrollTop, scrollHeight }: CentreMeasures): number {
  const middle = viewTop + viewHeight / 2;
  const wanted = scrollTop + (caretTop + caretBottom) / 2 - middle;
  const furthest = Math.max(0, scrollHeight - viewHeight);
  return Math.round(Math.min(furthest, Math.max(0, wanted)));
}

export interface CentreOptions {
  /** Glide there (the default), or go at once — when the paper has only just been drawn. */
  readonly smooth?: boolean;
}

/** Scroll so the caret's line is in the middle of the window. A selection that is not text is left alone. */
export function centreCaretLine(view: EditorView, { smooth = true }: CentreOptions = {}): void {
  if (!(view.state.selection instanceof TextSelection)) return;
  const scroller = scrollerOf(view.dom);
  if (scroller === undefined) return;
  const caret = caretRect(view);
  const box = scroller.getBoundingClientRect();
  const top = centredScrollTop({
    caretTop: caret.top,
    caretBottom: caret.bottom,
    viewTop: box.top,
    viewHeight: scroller.clientHeight,
    scrollTop: scroller.scrollTop,
    scrollHeight: scroller.scrollHeight,
  });
  // A writer who has asked for less motion is taken there at once.
  const still = view.dom.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  if (smooth && !still) {
    glideTo(scroller, top);
    return;
  }
  stopGlide(scroller);
  scroller.scrollTo({ top, behavior: "auto" });
}
