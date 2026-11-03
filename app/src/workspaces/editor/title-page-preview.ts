/**
 * View Title Page: the title page drawn on a sheet, read-only.
 *
 * It draws `titlePageRuns` and nothing else — the list the PDF's first page
 * prints — so there is no second placement to drift from the first. A modal
 * `<dialog>`, like the other dialogs: Escape closes it natively, and the
 * window behind (which answers Escape by closing the project) hears nothing.
 */
import { PAGE } from "../../../../src/screenplay/geometry.ts";
import type { TitlePageField } from "../../../../src/screenplay/document.ts";
import { SHEET_POINTS, titlePageRuns } from "../../../../src/screenplay/title-page-layout.ts";
import { element } from "../../screens/element.ts";

const SVG = "http://www.w3.org/2000/svg";

export function showTitlePagePreview(
  into: HTMLElement,
  titlePage: readonly TitlePageField[],
  onClose: () => void = () => {},
): HTMLDialogElement {
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

  const close = element("button", { className: "button button--leading", type: "button", textContent: "Close" });
  const modal = element("dialog", { className: "report title-preview", ariaLabel: "Title page preview" }, [
    element("h2", { className: "report__heading", textContent: "Title Page" }),
    runs.length === 0
      ? element("p", { className: "report__nothing", textContent: "There is no title page to show yet." })
      : element("p", { className: "report__standfirst", textContent: "As it prints. Esc closes." }),
    sheet,
    element("div", { className: "report__actions" }, [close]),
  ]);
  close.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    onClose();
  });
  into.append(modal);
  modal.showModal();
  close.focus();
  return modal;
}
