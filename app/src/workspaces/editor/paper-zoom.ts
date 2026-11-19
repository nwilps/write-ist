/**
 * How large the paper is drawn: View ▸ Zoom, Reset Zoom, and their keys.
 *
 * **Five levels, measured from the window, with 100% in the middle.** Each
 * level is a size that means something on the desk, not a percentage:
 *
 *   0. One whole sheet fits the window top to bottom, with the panel gap
 *      (`--space-panel-gap`) above and below it.
 *   1. Halfway between that and 100%.
 *   2. 100%: where every run of the app starts, and where Reset Zoom goes.
 *   3. The paper grows until the side panels reach the window's edges, the
 *      panel gap still between the paper and each panel.
 *   4. The paper fills the window's width, with the panel gap at either side.
 *      The panels are still on the desk, hanging just past the window's edges.
 *
 * The window decides them, so they are worked out again whenever it changes
 * size, and the level the writer chose is kept. **They never run backwards:**
 * a zoom out that would be larger than 100% (a very tall window) is 100%, and
 * a zoom in that would be smaller (a narrow one, which on the first window's
 * 1100px is level 3) is 100% too, so stepping in may change nothing until a
 * level that really is larger.
 *
 * **Only how large, never where the sheets break.** The paper is laid out at
 * its own size, as the page count has it, and then drawn larger or smaller as
 * a whole (`zoom` on `.page`, read from `--paper-zoom`). The type and the
 * insets are never touched, so a line wraps where it did and a sheet holds
 * what it did: a sheet is the same sheet at any zoom (#40).
 *
 * The chrome — the panels, the pills, the workspace bar, the menus and the
 * dialogs — is not the paper, and stays the size it was.
 *
 * **For this run of the app, not for a project.** One level for the Editor,
 * kept while the app is open, so opening another project finds the paper as
 * the writer left it; quitting forgets it, and the next run starts at 100%.
 */

/** How many levels there are. */
export const ZOOM_LEVELS = 5;
/** The middle one, 100%: where Reset Zoom goes and where every run of the app starts. */
export const ZOOM_DEFAULT = 2;

/** The least the paper is drawn at, however short the window: a quarter. */
const SMALLEST = 0.25;

/** What the levels are measured from, in pixels. */
export interface ZoomRoom {
  /** The window the paper scrolls in: its visible width and height. */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** One sheet at 100%: `--page-width` and `--page-height`. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** A side panel's width, `--size-panel`. */
  readonly panel: number;
  /** The gap between the paper and a panel, `--space-panel-gap`: the margin every level keeps. */
  readonly gap: number;
}

/**
 * The five scales, smallest first (1 is 100%). A room that cannot be measured
 * (nothing drawn yet) is five times 100%, rather than a paper of no size.
 */
export function zoomScales(room: ZoomRoom): readonly number[] {
  const { viewWidth, viewHeight, pageWidth, pageHeight, panel, gap } = room;
  if (!(viewWidth > 0 && viewHeight > 0 && pageWidth > 0 && pageHeight > 0)) return Array(ZOOM_LEVELS).fill(1);
  const out2 = Math.min(1, Math.max(SMALLEST, (viewHeight - 2 * gap) / pageHeight));
  const out1 = (out2 + 1) / 2;
  const in1 = Math.max(1, (viewWidth - 2 * panel - 2 * gap) / pageWidth);
  const in2 = Math.max(in1, (viewWidth - 2 * gap) / pageWidth);
  return [out2, out1, 1, in1, in2];
}

/** One level larger, stopping at the largest. */
export function zoomedIn(level: number): number {
  return held(level + 1);
}

/** One level smaller, stopping at the smallest. */
export function zoomedOut(level: number): number {
  return held(level - 1);
}

/** A level that exists. */
function held(level: number): number {
  return Math.min(ZOOM_LEVELS - 1, Math.max(0, Math.round(level)));
}

/** The level for this run of the app, shared by every project opened in it. */
let current = ZOOM_DEFAULT;

export function paperZoomLevel(): number {
  return current;
}

export function setPaperZoomLevel(level: number): void {
  current = held(level);
}

/**
 * The room the levels are measured from, as the window has it now: the
 * scroller's visible size (the window itself, where the paper has no scroller)
 * and the tokens, as the stylesheet resolves them on the root.
 */
export function measureZoomRoom(root: HTMLElement, scroller: HTMLElement | undefined): ZoomRoom {
  const window = root.ownerDocument.defaultView;
  const style = window?.getComputedStyle(root);
  const token = (name: string): number => {
    const parsed = Number.parseFloat(style?.getPropertyValue(name) ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    viewWidth: scroller?.clientWidth ?? window?.innerWidth ?? 0,
    viewHeight: scroller?.clientHeight ?? window?.innerHeight ?? 0,
    pageWidth: token("--page-width"),
    pageHeight: token("--page-height"),
    panel: token("--size-panel"),
    gap: token("--space-panel-gap"),
  };
}

/**
 * Draw the paper at a scale (1 is 100%). Set on the document's root, because
 * the paper's fades are the shell's and sit outside the Editor.
 */
export function drawPaperZoom(root: HTMLElement, scale: number): void {
  root.style.setProperty("--paper-zoom", String(scale));
}
