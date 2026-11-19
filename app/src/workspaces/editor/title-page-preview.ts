/**
 * The title page drawn on a sheet, read-only: View Title Page's face of the
 * title page dialog (`title-page-dialog.ts`).
 *
 * It draws `titlePageRuns` and nothing else — the list the PDF's first page
 * prints — so there is no second placement to drift from the first.
 */
import { PAGE } from "../../../../src/screenplay/geometry.ts";
import type { TitlePageField } from "../../../../src/screenplay/document.ts";
import { SHEET_POINTS, titlePageRuns } from "../../../../src/screenplay/title-page-layout.ts";
import { element } from "../../screens/element.ts";

const SVG = "http://www.w3.org/2000/svg";

/** The sheet, and a line saying so when there is nothing on it. */
export function titlePagePreview(titlePage: readonly TitlePageField[]): readonly Element[] {
  const runs = titlePageRuns(titlePage);

  const sheet = document.createElementNS(SVG, "svg");
  sheet.setAttribute("viewBox", `0 0 ${SHEET_POINTS.width} ${SHEET_POINTS.height}`);
  sheet.setAttribute("class", "title-sheet");
  sheet.setAttribute("role", "img");
  sheet.setAttribute("aria-label", "The title page as it prints");
  for (const run of runs) {
    const drawn = document.createElementNS(SVG, "text");
    drawn.setAttribute("x", String(run.x));
    drawn.setAttribute("y", String(run.y));
    drawn.setAttribute("font-size", String(PAGE.fontSizePoints));
    drawn.setAttribute(
      "class",
      ["title-run", run.bold && "title-run--bold", run.italic && "title-run--italic", run.underline && "title-run--underline"]
        .filter(Boolean)
        .join(" "),
    );
    drawn.textContent = run.text;
    sheet.append(drawn);
  }

  return runs.length === 0
    ? [sheet, element("p", { className: "title-page__nothing", textContent: "There is no title page to show yet." })]
    : [sheet];
}
