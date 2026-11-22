/**
 * A screenplay project's own formatting: the choices Settings ▸ New Project
 * Defaults offers for a screenplay, which New Project gives a new project and
 * the project then keeps for itself (`details.md`, `src/project/details.ts`).
 *
 * Each is a choice about how the script is set, so each reaches everything
 * that sets it: the paper, the page count and the PDF alike.
 *
 * - **Bold scene headings** — the PDF's headings are bold. The paper's always
 *   are: it draws them bold and in the accent colour for feel, not geometry
 *   (`editor.css`), and Courier Prime's bold is metrically its regular, so no
 *   page moves either way.
 * - **Bold transitions** — on the paper and in the PDF.
 * - **Blank lines before scene headings** — 2 is Final Draft's template, the
 *   spacing table's own (ADR-0038); 1 closes every 2-line gap above a heading
 *   to 1. A gap the table makes smaller than that (none, after a boneyard's
 *   opening) is left alone. It moves the page count, as it would in print.
 *
 * A project that never chose — every project made before these existed — has
 * `DEFAULT_FORMATTING`, which is how the paper and the PDF were set until now.
 */

export interface Formatting {
  readonly boldSceneHeadings: boolean;
  readonly boldTransitions: boolean;
  readonly blankLinesBeforeSceneHeadings: 1 | 2;
}

export const DEFAULT_FORMATTING: Formatting = {
  boldSceneHeadings: false,
  boldTransitions: false,
  blankLinesBeforeSceneHeadings: 2,
};

/** Blank lines above a scene heading that the table would set `table` lines down. */
export function headingGap(table: number, formatting: Formatting): number {
  return Math.min(table, formatting.blankLinesBeforeSceneHeadings);
}
