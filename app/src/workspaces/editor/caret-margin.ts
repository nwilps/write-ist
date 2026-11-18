/**
 * How far in from the window's top and bottom the caret is kept while the
 * writer types or moves with the arrows.
 *
 * ProseMirror's own default is a few pixels, which leaves the caret against the edge —
 * and here the edge is not the edge: the paper fades out over its last
 * `--size-paper-fade`, under the workspace bar at the top and the pills at the
 * foot. So the caret is kept clear of the fade and then a few lines further in,
 * the way other editors keep a margin of text around the line being written.
 * Not a typewriter: inside the margin, the paper does not move.
 *
 * In a window too short for that, the margin gives way to a third of what is
 * visible, so the caret always has the middle of the window to sit in.
 */

/** Lines of paper kept clear between the caret and the fade. */
export const COMFORT_LINES = 3;

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

/** The margin above and below the caret, in pixels. */
export function caretMargin({ fade, line, visible }: Measures): number {
  const wanted = fade + COMFORT_LINES * line;
  return Math.round(Math.min(wanted, Math.max(fade, visible / 3)));
}

/**
 * The view's `scrollMargin` and `scrollThreshold`: the same distance for both,
 * so the paper moves only once the caret comes inside the margin, and then
 * only far enough to put it back at the margin. The sides are left alone.
 */
export function caretScrolling(measures: Measures): {
  readonly scrollMargin: { top: number; bottom: number; left: number; right: number };
  readonly scrollThreshold: { top: number; bottom: number; left: number; right: number };
} {
  const margin = caretMargin(measures);
  return {
    scrollMargin: { top: margin, bottom: margin, left: SIDE_MARGIN, right: SIDE_MARGIN },
    scrollThreshold: { top: margin, bottom: margin, left: 0, right: 0 },
  };
}

/** The measures as the window has them now. */
export function measureCaretRoom(manuscript: HTMLElement): Measures {
  const view = manuscript.ownerDocument.defaultView;
  const fade = pixels(
    view === null ? "" : view.getComputedStyle(manuscript.ownerDocument.documentElement).getPropertyValue("--size-paper-fade"),
  );
  const style = view?.getComputedStyle(manuscript);
  const fontSize = pixels(style?.fontSize ?? "");
  // `normal` is the face's own leading; about 1.2 of the size for Courier Prime.
  const line = pixels(style?.lineHeight ?? "") || fontSize * 1.2;
  return { fade, line, visible: view?.innerHeight ?? 0 };
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
