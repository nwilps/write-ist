/**
 * Export As: every format in one dialog, and a page range where the format has
 * pages.
 *
 * File Type, then Pages and the From → To row under it. Everything is always
 * shown: what does not apply to the chosen file type is dimmed and the keys
 * step over it, and Export is dimmed for a file type nothing writes yet.
 *
 * New Project's dialog, built from its pieces, its shared button, drop-down and
 * keys among them: a modal `<dialog>`, Escape cancels it natively, Enter on
 * Export or in a page box being edited exports. It stays up until the file is written, so a range
 * that will not do, or a file that could not be written, is said here and the
 * writer can change it and try again. The formats are
 * `src/project/export-formats.ts`'s; this draws them and listens.
 */
import type { ExportFormat } from "../../../../src/project/export-formats.ts";
import { pageRangeProblem, type PageRange } from "../../../../src/screenplay/pdf-pages.ts";
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys, enterSubmits } from "../../screens/dialog-keys.ts";
import { dialogSelect } from "../../screens/dialog-select.ts";
import { element } from "../../screens/element.ts";
import { chevron, field } from "../../screens/new-project.ts";
import { message, trouble } from "../../screens/trouble.ts";
import { rowArrow } from "./goals-dialog.ts";

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
  const pageBox = (id: string): HTMLInputElement =>
    element("input", {
      id,
      className: "new-project-dialog__input",
      type: "number",
      min: "1",
      step: "1",
      autocomplete: "off",
      // Off until a range is asked for: `redraw` decides.
      disabled: true,
    });

  const format = dialogSelect({
    id: "export-format",
    label: "File Type",
    choices: options.formats.map(({ id, label }) => ({ value: id, label })),
    onChange: () => redraw(),
  });
  const pageChoice = dialogSelect({
    id: "export-pages",
    label: "Pages",
    choices: [
      { value: "all", label: "All Pages" },
      { value: "range", label: "Page Range" },
    ],
    // The focus stays here, so the writer can change this again; Tab goes to From.
    onChange: () => redraw(),
  });
  const from = pageBox("export-from");
  const to = pageBox("export-to");

  const label = (words: string, box: HTMLInputElement): HTMLLabelElement =>
    element("label", { htmlFor: box.id, className: "new-project-dialog__label", textContent: words });
  const boxed = (box: HTMLInputElement): HTMLElement => element("div", { className: "new-project-dialog__box" }, [box]);
  // Always there, so the dialog keeps its shape; dimmed when it is not the writer's to change.
  const range = element("div", { className: "export-as__range" }, [
    label("From", from),
    boxed(from),
    rowArrow(),
    label("To", to),
    boxed(to),
  ]);

  const problem = element("div", { className: "new-project__problem" });
  const cancel = dialogAction("Cancel", "Esc", "button");
  const confirm = dialogAction("Export", "Enter", "submit");
  // `noValidate`: the boxes' limits are said in `problem`, not in the webview's own bubble.
  const form = element("form", { className: "new-project-dialog__form", noValidate: true }, [
    field("File Type", format.control, [chevron(), format.tray]),
    // The right-click menu's separator, inset as it is there.
    element("div", { className: "drop-menu__divider", role: "separator" }),
    field("Pages", pageChoice.control, [chevron(), pageChoice.tray]),
    range,
    // Empty, it is not drawn, so nothing opens up under the range.
    problem,
    // The same separator again, closing the range off from the buttons.
    element("div", { className: "drop-menu__divider", role: "separator" }),
    element("div", { className: "new-project-dialog__actions" }, [cancel, confirm]),
  ]);
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog export-as", ariaLabel: "Export As" }, [form]);
  dialogKeys(modal, [[format.control], [pageChoice.control], [from, to], [cancel, confirm]]);

  const chosen = (): ExportFormat => options.formats.find(({ id }) => id === format.value())!;
  const wantsRange = (): boolean => chosen().pageRange && pageChoice.value() === "range";
  const typed = (box: HTMLInputElement): number => (box.value.trim() === "" ? NaN : Number(box.value));

  // What the writer typed in the boxes, kept while they show the whole script instead.
  let kept: { readonly from: string; readonly to: string } | undefined;

  function redraw(): void {
    problem.replaceChildren();
    const exported = chosen();
    // A format without pages leaves Pages on All Pages, dimmed.
    if (!exported.pageRange) pageChoice.set("all");
    pageChoice.control.disabled = !exported.pageRange;
    confirm.disabled = !exported.writable;
    const ranged = wantsRange();
    if (ranged && from.disabled) {
      from.value = kept?.from ?? "1";
      to.value = kept?.to ?? String(options.pageCount());
    } else if (!ranged) {
      if (!from.disabled) kept = { from: from.value, to: to.value };
      // The whole script, for reference.
      from.value = "1";
      to.value = String(options.pageCount());
    }
    from.disabled = to.disabled = !ranged;
  }
  for (const box of [from, to]) box.addEventListener("input", () => problem.replaceChildren());

  // While the save dialog is up or the file is being written, the answer is on its way.
  let exporting = false;
  const exportNow = async (): Promise<void> => {
    if (exporting) return;
    const exported = chosen();
    // Export is dimmed for a format nothing writes yet, and Enter is no way round it.
    if (!exported.writable) return;
    let pageRange: PageRange | undefined;
    if (wantsRange()) {
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
  enterSubmits(modal, form);
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
  format.control.focus();
  return modal;
}
