/**
 * The import report (ADR-0020, ADR-0028).
 *
 * *"This is imported; here is what was adjusted so it can be edited here;
 * dismiss when satisfied."* It **stays until the writer dismisses it** — it is
 * a `<dialog>` opened modally, so Escape and the Done button are the only ways
 * out, and nothing about the screenplay changes behind the writer's back.
 *
 * What each line says is decided in `src/project/report.ts`, where it is
 * checkable. This file only puts those lines on the page.
 *
 * **A manuscript reloaded after a change made elsewhere is reported the same
 * way** (ADR-0028: *"a reloaded file is treated as an import … and the report
 * names them"*, #42), so the dialog takes its words from its caller and the
 * two say what is true of each.
 */
import type { ImportReportLine } from "../../../src/project/report.ts";
import { element } from "./element.ts";

export interface ImportReportScreen {
  readonly projectName: string;
  readonly lines: readonly ImportReportLine[];
  readonly onDismiss: () => void;
}

export function showImportReport(
  into: HTMLElement,
  { projectName, lines, onDismiss }: ImportReportScreen,
): HTMLDialogElement {
  return showReport(into, {
    heading: `${projectName} is imported`,
    standfirst:
      "It is saved, and the file you imported from is exactly as it was. Here is what Write-ist adjusted so the screenplay can be edited here.",
    nothing: "Nothing needed adjusting. Your screenplay was saved exactly as you wrote it.",
    lines,
    onDismiss,
  });
}

/** What a report says, besides its lines. */
export interface ReportScreen {
  readonly heading: string;
  readonly standfirst: string;
  /** Said instead of the lines when there are none. */
  readonly nothing: string;
  readonly lines: readonly ImportReportLine[];
  readonly onDismiss: () => void;
}

export function showReport(
  into: HTMLElement,
  { heading, standfirst, nothing, lines, onDismiss }: ReportScreen,
): HTMLDialogElement {
  const done = element("button", {
    className: "button button--leading",
    type: "button",
    textContent: "Done",
  });

  const modal = element("dialog", { className: "report" }, [
    element("h2", { className: "report__heading", textContent: heading }),
    element("p", { className: "report__standfirst", textContent: standfirst }),
    lines.length === 0 ? nothingAdjusted(nothing) : changes(lines),
    element("div", { className: "report__actions" }, [done]),
  ]);

  modal.addEventListener("close", () => {
    modal.remove();
    onDismiss();
  });
  done.addEventListener("click", () => modal.close());

  into.append(modal);
  modal.showModal();
  done.focus();
  return modal;
}

function changes(lines: readonly ImportReportLine[]): HTMLElement {
  return element(
    "ul",
    { className: "report__changes" },
    lines.map((line) =>
      element(
        "li",
        // A finding is not a change (ADR-0018): an unmatched comment delimiter
        // was left exactly as the writer typed it, and saying it was adjusted
        // would be a lie about their file.
        { className: line.changed ? "change" : "change change--finding" },
        [
          element("span", {
            className: "change__count",
            textContent: line.count.toLocaleString("en-GB"),
          }),
          element("span", { className: "change__description", textContent: line.description }),
        ],
      ),
    ),
  );
}

function nothingAdjusted(words: string): HTMLElement {
  // An empty report is still a report: a writer whose file needed nothing has
  // been told something worth knowing.
  return element("p", { className: "report__nothing", textContent: words });
}
