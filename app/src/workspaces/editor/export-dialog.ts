/**
 * Export As: every format in one dialog, and a page range where the format has
 * pages.
 *
 * New Project's dialog, built from its pieces: a modal `<dialog>`, Escape
 * cancels it natively, Enter exports. It stays up until the file is written, so a range
 * that will not do, or a file that could not be written, is said here and the
 * writer can change it and try again. The formats are
 * `src/project/export-formats.ts`'s; this draws them and listens.
 */
import type { ExportFormat } from "../../../../src/project/export-formats.ts";
import { pageRangeProblem, type PageRange } from "../../../../src/screenplay/pdf-pages.ts";
import { element } from "../../screens/element.ts";
import { action, chevron, field } from "../../screens/new-project.ts";
import { message, trouble } from "../../screens/trouble.ts";

export interface ExportDialogOptions {
  /** The first is chosen to begin with. */
  readonly formats: readonly ExportFormat[];
  /** The numbered pages the script prints as it stands now. */
  readonly pageCount: () => number;
  /** Ask where and write. `false`: the writer cancelled the save dialog. */
  readonly write: (format: ExportFormat, range: PageRange | undefined) => Promise<boolean>;
  /** For a failure that arrives once the dialog has gone. */
  readonly report: (words: string) => void;
  readonly closed: () => void;
}

export function openExportDialog(into: HTMLElement, options: ExportDialogOptions): HTMLDialogElement {
  const dropDown = (id: string, choices: readonly { readonly value: string; readonly label: string }[]): HTMLSelectElement =>
    element(
      "select",
      { id, className: "new-project-dialog__input" },
      choices.map(({ value, label }) => element("option", { value, textContent: label })),
    );
  const pageBox = (id: string): HTMLInputElement =>
    element("input", {
      id,
      className: "new-project-dialog__input",
      type: "number",
      min: "1",
      step: "1",
      autocomplete: "off",
    });

  const format = dropDown(
    "export-format",
    options.formats.map(({ id, label }) => ({ value: id, label })),
  );
  const pageChoice = dropDown("export-pages", [
    { value: "all", label: "All pages" },
    { value: "range", label: "From / to" },
  ]);
  const from = pageBox("export-from");
  const to = pageBox("export-to");

  const pages = field("Pages", pageChoice, [chevron()]);
  const range = element("div", { className: "export-as__range" }, [field("From", from), field("To", to)]);

  const problem = element("div", { className: "new-project__problem" });
  const cancel = action("Cancel", "Esc", "button");
  const confirm = action("Export", "Enter", "submit");
  confirm.classList.add("new-project-dialog__action--confirm");
  // `noValidate`: the boxes' limits are said in `problem`, not in the webview's own bubble.
  const form = element("form", { className: "new-project-dialog__form", noValidate: true }, [
    field("Format", format, [chevron()]),
    pages,
    range,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog export-as", ariaLabel: "Export As" }, [form]);

  const chosen = (): ExportFormat => options.formats.find(({ id }) => id === format.value)!;
  const wantsRange = (): boolean => pageChoice.value === "range";
  const typed = (box: HTMLInputElement): number => (box.value.trim() === "" ? NaN : Number(box.value));

  const redraw = (): void => {
    problem.replaceChildren();
    pages.hidden = !chosen().pageRange;
    range.hidden = pages.hidden || !wantsRange();
  };
  format.addEventListener("change", redraw);
  pageChoice.addEventListener("change", () => {
    // What the writer typed before stepping away is kept.
    if (wantsRange() && from.value === "" && to.value === "") {
      from.value = "1";
      to.value = String(options.pageCount());
    }
    // The focus stays here, so the arrow keys can go on changing this; Tab goes to From.
    redraw();
  });
  for (const box of [from, to]) box.addEventListener("input", () => problem.replaceChildren());

  // While the save dialog is up or the file is being written, the answer is on its way.
  let exporting = false;
  const exportNow = async (): Promise<void> => {
    if (exporting) return;
    const exported = chosen();
    let pageRange: PageRange | undefined;
    if (exported.pageRange && wantsRange()) {
      pageRange = { from: typed(from), to: typed(to) };
      const wrong = pageRangeProblem(pageRange, options.pageCount());
      if (wrong !== undefined) {
        problem.replaceChildren(trouble(wrong));
        return;
      }
    }
    problem.replaceChildren();
    exporting = true;
    try {
      // Cancelling the save dialog comes back here, with the choices as they were.
      if ((await options.write(exported, pageRange)) && modal.open) modal.close();
    } catch (error) {
      const words = `${exported.failure} Your screenplay is unchanged. ${message(error)}`;
      if (modal.open) problem.replaceChildren(trouble(words));
      else options.report(words);
    } finally {
      exporting = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void exportNow();
  });
  // Enter exports from a drop-down as well as from a box. A button keeps its
  // own Enter, so Cancel cancels; Alt+Enter is the window's.
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.altKey || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    form.requestSubmit();
  });
  cancel.addEventListener("click", () => {
    if (!exporting) modal.close();
  });
  modal.addEventListener("cancel", (event) => {
    if (exporting) event.preventDefault();
  });
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  redraw();
  into.append(modal);
  modal.showModal();
  format.focus();
  return modal;
}
