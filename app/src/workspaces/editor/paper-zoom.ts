/**
 * How large the paper is drawn: View ▸ Zoom In, Zoom Out and Reset Zoom.
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
 * **For this run of the app, not for a project.** One zoom for the Editor,
 * kept while the app is open, so opening another project finds the paper as
 * the writer left it; quitting forgets it, and the next run starts at 100%.
 */

/** In percent: the steps Zoom In and Zoom Out take, and the two ends. */
export const ZOOM_STEP = 10;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
/** Where Reset Zoom goes, and where every run of the app starts. */
export const ZOOM_RESET = 100;

/** One step larger, stopping at the largest. */
export function zoomedIn(percent: number): number {
  return held(percent + ZOOM_STEP);
}

/** One step smaller, stopping at the smallest. */
export function zoomedOut(percent: number): number {
  return held(percent - ZOOM_STEP);
}

/** A zoom inside the two ends, in whole percent. */
function held(percent: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(percent)));
}

/** The zoom for this run of the app, shared by every project opened in it. */
let current = ZOOM_RESET;

export function paperZoom(): number {
  return current;
}

export function setPaperZoom(percent: number): void {
  current = held(percent);
}

/**
 * Draw the paper at a zoom, in percent. Set on the document's root, because
 * the paper's fades are the shell's and sit outside the Editor.
 */
export function drawPaperZoom(root: HTMLElement, percent: number): void {
  root.style.setProperty("--paper-zoom", String(percent / 100));
}
