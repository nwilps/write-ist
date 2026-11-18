/**
 * Export As: every format in one dialog, and a page range where the format has
 * pages.
 *
 * Built like the New Project dialog: a modal `<dialog>`, Escape cancels it
 * natively, Enter exports. It stays up until the file is written, so a range
 * that will not do, or a file that could not be written, is said here and the
 * writer can change it and try again. The formats are
 * `src/project/export-formats.ts`'s; this draws them and listens.
 */
import type { ExportFormat } from "../../../../src/project/export-formats.ts";
import { pageRangeProblem, type PageRange } from "../../../../src/screenplay/pdf-pages.ts";
import { element } from "../../screens/element.ts";
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
  const choice = (name: string, id: string, label: string, checked: boolean) => {
    const radio = element("input", { type: "radio", name, id, checked, className: "export-as__radio" });
    const row = element("label", { htmlFor: id, className: "export-as__choice" }, [radio, element("span", { textContent: label })]);
    return { radio, row };
  };
  const pageBox = (id: string, ariaLabel: string): HTMLInputElement =>
    element("input", {
      id,
      ariaLabel,
      className: "field__input export-as__number",
      type: "number",
      min: "1",
      step: "1",
      autocomplete: "off",
      disabled: true,
    });

  const formats = options.formats.map((format, at) => ({
    format,
    ...choice("export-format", `export-format-${format.id}`, format.label, at === 0),
  }));
  const all = choice("export-pages", "export-pages-all", "All pages", true);
  const some = choice("export-pages", "export-pages-range", "From", false);
  const from = pageBox("export-from", "From page");
  const to = pageBox("export-to", "To page");

  const pages = element("div", { className: "field export-as__pages" }, [
    element("span", { className: "field__label", textContent: "Pages" }),
    element("div", { className: "export-as__choices", role: "radiogroup", ariaLabel: "Pages" }, [
      all.row,
      element("div", { className: "export-as__range" }, [
        some.row,
        from,
        element("label", { htmlFor: "export-to", className: "export-as__choice", textContent: "to" }),
        to,
      ]),
    ]),
  ]);

  const problem = element("div", { className: "new-project__problem" });
  const cancel = element("button", { className: "button", type: "button", textContent: "Cancel" });
  const confirm = element("button", { className: "button button--leading", type: "submit", textContent: "Export" });
  // `noValidate`: the boxes' limits are said in `problem`, not in the webview's own bubble.
  const form = element("form", { className: "new-project__form export-as__form", noValidate: true }, [
    element("h2", { className: "report__heading", textContent: "Export As" }),
    element("div", { className: "field" }, [
      element("span", { className: "field__label", textContent: "Format" }),
      element(
        "div",
        { className: "export-as__choices", role: "radiogroup", ariaLabel: "Format" },
        formats.map(({ row }) => row),
      ),
    ]),
    pages,
    problem,
    element("div", { className: "report__actions new-project__actions" }, [cancel, confirm]),
  ]);
  const modal = element("dialog", { className: "report new-project export-as", ariaLabel: "Export As" }, [form]);

  const chosen = (): ExportFormat => formats.find(({ radio }) => radio.checked)!.format;
  const typed = (box: HTMLInputElement): number => (box.value.trim() === "" ? NaN : Number(box.value));

  const redraw = (): void => {
    problem.replaceChildren();
    pages.hidden = !chosen().pageRange;
    from.disabled = to.disabled = !some.radio.checked;
  };
  for (const { radio } of formats) radio.addEventListener("change", redraw);
  all.radio.addEventListener("change", redraw);
  some.radio.addEventListener("change", () => {
    // What the writer typed before stepping away is kept.
    if (from.value === "" && to.value === "") {
      from.value = "1";
      to.value = String(options.pageCount());
    }
    redraw();
    from.focus();
    from.select();
  });
  for (const box of [from, to]) box.addEventListener("input", () => problem.replaceChildren());

  // While the save dialog is up or the file is being written, the answer is on its way.
  let exporting = false;
  const exportNow = async (): Promise<void> => {
    if (exporting) return;
    const format = chosen();
    let range: PageRange | undefined;
    if (format.pageRange && some.radio.checked) {
      range = { from: typed(from), to: typed(to) };
      const wrong = pageRangeProblem(range, options.pageCount());
      if (wrong !== undefined) {
        problem.replaceChildren(trouble(wrong));
        return;
      }
    }
    problem.replaceChildren();
    exporting = true;
    try {
      // Cancelling the save dialog comes back here, with the choices as they were.
      if ((await options.write(format, range)) && modal.open) modal.close();
    } catch (error) {
      const words = `${format.failure} Your screenplay is unchanged. ${message(error)}`;
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
  // Enter exports from a choice as well as from a box. A button keeps its own
  // Enter, so Cancel cancels; Alt+Enter is the window's.
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
  formats[0]!.radio.focus();
  return modal;
}
