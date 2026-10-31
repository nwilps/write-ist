/**
 * The seam between two sheets of paper, drawn (ADR-0033, ADR-0024).
 *
 * The foot of one sheet, the strip of desk, and the head of the next with its
 * page number — and, where a speech crosses, `(MORE)` and `CHARACTER (CONT'D)`.
 * All of it is text on the page and none of it is in the document: this is the
 * DOM of a widget decoration (`src/screenplay/sheets.ts`), which copy, cut,
 * Select All and the serialiser never see.
 *
 * How it looks is `app/src/style/sheets.css`; this builds the parts.
 */
import type { SheetBreak } from "../../../../src/screenplay/sheets.ts";
import { element } from "../../screens/element.ts";

/** `(CONT'D)` as the layout ends the cue with it. */
const CONTD = "(CONT'D)";

export function drawSheetBreak(seam: SheetBreak): HTMLElement {
  const parts: HTMLElement[] = [];

  if (seam.more) {
    parts.push(element("div", { className: "sheet-break__more", textContent: "(MORE)" }));
  }

  // The rest of the sheet, a row at a time: a newline is a row in a block that
  // keeps its line breaks, so the height is the manuscript's own leading and no
  // number is written here.
  parts.push(
    element("div", {
      className: "sheet-break__foot",
      textContent: "\n".repeat(seam.rowsLeft),
    }),
  );
  parts.push(element("div", { className: "sheet-break__desk" }));
  parts.push(
    element("div", {
      className: "sheet-break__head",
      textContent: `${seam.page}.`,
    }),
  );

  if (seam.contd !== undefined) {
    const cue = seam.contd.endsWith(CONTD) ? seam.contd.slice(0, -CONTD.length) : seam.contd;
    const rest = seam.contd.slice(cue.length);
    parts.push(
      element("div", { className: "sheet-break__contd" }, [
        element("span", { className: "sheet-break__cue", textContent: cue }),
        element("span", {
          className: "sheet-break__extension",
          textContent: rest,
        }),
      ]),
    );
  }

  const seamElement = element("div", { className: "sheet-break" }, parts);
  seamElement.contentEditable = "false";
  seamElement.setAttribute("aria-hidden", "true");
  return seamElement;
}
