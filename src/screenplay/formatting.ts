/**
 * A screenplay project's own formatting: the choices Settings ▸ New Project
 * Defaults offers for a screenplay, which New Project gives a new project and
 * the project then keeps for itself (`details.md`, `src/project/details.ts`).
 *
 * - **Bold scene headings** and **bold transitions** — **the paper's only**
 *   (Noah, 2026-11-22). Off draws that element at regular weight on the
 *   paper. Neither reaches the PDF: its headings and transitions are regular
 *   unless the writer asks for bold in Export As, for that export only
 *   (`PdfEmphasis`, `pdf-pages.ts`). Courier Prime's bold is metrically its
 *   regular, so neither moves a line or a page, on the paper or in the PDF.
 * - **Blank lines before scene headings** — 2 is Final Draft's template, the
 *   spacing table's own (ADR-0038); 1 closes every 2-line gap above a heading
 *   to 1. A gap the table makes smaller than that (none, after a boneyard's
 *   opening) is left alone. It moves the page count, on the paper and in the
 *   PDF alike, as it would in print.
 *
 * A project that never chose — every project made before these existed — has
 * `DEFAULT_FORMATTING`, which is how the paper has always looked: headings
 * bold, transitions regular. New Project Defaults start a new project with
 * both bold (`DEFAULT_PROJECT_DEFAULTS`).
 */

export interface Formatting {
  /** The paper's scene headings are bold. */
  readonly boldSceneHeadings: boolean;
  /** The paper's transitions are bold. */
  readonly boldTransitions: boolean;
  readonly blankLinesBeforeSceneHeadings: 1 | 2;
}

export const DEFAULT_FORMATTING: Formatting = {
  // The paper has always drawn its headings bold, and its transitions regular.
  boldSceneHeadings: true,
  boldTransitions: false,
  blankLinesBeforeSceneHeadings: 2,
};

/** Blank lines above a scene heading that the table would set `table` lines down. */
export function headingGap(table: number, formatting: Formatting): number {
  return Math.min(table, formatting.blankLinesBeforeSceneHeadings);
}
