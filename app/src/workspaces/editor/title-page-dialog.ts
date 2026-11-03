/**
 * Edit Title Page: one box per title-page key, prefilled from the manuscript.
 *
 * Built like the New Project dialog: a modal `<dialog>`, Escape cancels it
 * natively, Enter in a one-line box saves. A box that can hold several lines
 * (Author, Contact, Notes — and any value that already has more than
 * one) is a text area, where Enter is a new line and Ctrl+Enter saves. What a
 * value *means* — marks, continuation indent, keys the dialog has no box for —
 * is `src/screenplay/title-page.ts`'s; this draws and listens.
 */
import type { TitlePageField } from "../../../../src/screenplay/document.ts";
import {
  TITLE_PAGE_KEYS,
  applyForm,
  formOf,
  sameTitlePage,
  type TitlePageForm,
  type TitlePageKey,
} from "../../../../src/screenplay/title-page.ts";
import { element } from "../../screens/element.ts";
import { trouble } from "../../screens/trouble.ts";
import { showTitlePagePreview } from "./title-page-preview.ts";

export interface TitlePageDialogOptions {
  readonly titlePage: readonly TitlePageField[];
  /** The new title page, only when it differs from the one opened. */
  readonly save: (titlePage: readonly TitlePageField[]) => void;
  readonly closed: () => void;
}

/** What the dialog calls each box. */
const LABELS: Readonly<Record<TitlePageKey, string>> = {
  Title: "Title",
  Credit: "Credit",
  Author: "Author(s)",
  Source: "Source",
  "Draft date": "Draft date",
  Contact: "Contact",
  Notes: "Notes",
};

/** Keys whose value is naturally a list of lines. */
const SEVERAL_LINES: ReadonlySet<TitlePageKey> = new Set(["Author", "Contact", "Notes"]);

type Box = HTMLInputElement | HTMLTextAreaElement;

export function openTitlePageDialog(into: HTMLElement, options: TitlePageDialogOptions): HTMLDialogElement {
  const opened = formOf(options.titlePage);
  const boxes = new Map<TitlePageKey, Box>();

  const field = (id: string, label: string, box: Box): HTMLElement =>
    element("div", { className: "field" }, [
      element("label", { htmlFor: id, className: "field__label", textContent: label }),
      box,
    ]);

  const rows = TITLE_PAGE_KEYS.map((key) => {
    const id = `title-page-${key.toLowerCase().replace(/\s+/g, "-")}`;
    const value = opened.values[key];
    const box: Box =
      SEVERAL_LINES.has(key) || value.includes("\n")
        ? element("textarea", { id, className: "field__input field__input--lines", rows: 3, spellcheck: false })
        : element("input", { id, className: "field__input", type: "text", autocomplete: "off", spellcheck: false });
    box.value = value;
    boxes.set(key, box);
    return field(id, LABELS[key], box);
  });

  const view = element("button", { className: "button", type: "button", textContent: "View" });
  const cancel = element("button", { className: "button", type: "button", textContent: "Cancel" });
  const save = element("button", { className: "button button--leading", type: "submit", textContent: "Save" });
  const problem = element("div", { className: "new-project__problem" });

  const form = element("form", { className: "new-project__form title-page__form" }, [
    element("h2", { className: "report__heading", textContent: "Edit Title Page" }),
    element("div", { className: "title-page__fields" }, rows),
    problem,
    element("div", { className: "report__actions new-project__actions" }, [view, cancel, save]),
  ]);
  const modal = element("dialog", { className: "report new-project title-page", ariaLabel: "Edit Title Page" }, [form]);

  /** What the boxes hold now, applied to the title page opened. */
  const result = () => {
    const values = Object.fromEntries(TITLE_PAGE_KEYS.map((key) => [key, boxes.get(key)!.value])) as Record<
      TitlePageKey,
      string
    >;
    const typed: TitlePageForm = { values };
    return applyForm(options.titlePage, typed);
  };
  const say = (words: string): void => problem.replaceChildren(trouble(words));
  for (const box of boxes.values()) box.addEventListener("input", () => problem.replaceChildren());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const applied = result();
    if ("problem" in applied) {
      say(applied.problem);
      return;
    }
    // Nothing changed: nothing is written, not even an equal write.
    if (!sameTitlePage(applied.titlePage, options.titlePage)) options.save(applied.titlePage);
    modal.close();
  });
  // Ctrl+Enter saves from a several-line box, where Enter is a new line.
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  // What is typed now, saved or not; the model and the file are not touched.
  view.addEventListener("click", () => {
    const applied = result();
    if ("problem" in applied) {
      say(applied.problem);
      return;
    }
    showTitlePagePreview(into, applied.titlePage, () => view.focus());
  });
  cancel.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  into.append(modal);
  modal.showModal();
  boxes.get("Title")!.focus();
  return modal;
}
