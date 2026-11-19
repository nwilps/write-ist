/**
 * Edit Title Page: one box per title-page key, prefilled from the manuscript.
 *
 * New Project's dialog, built from its pieces, its shared buttons and keys among
 * them: a modal `<dialog>` with no heading, and Escape cancels it natively. The
 * boxes are stacked, one to a row, in a dialog tall enough to show them all.
 *
 * Enter in a one-line box saves. Contact and Notes, and any other value that
 * already has more than one line, are text areas that grow with their text:
 * there Enter is a new line and Ctrl+Enter saves. Author(s) is always one line.
 * What a value *means* — marks, continuation indent, keys the dialog has no box
 * for — is `src/screenplay/title-page.ts`'s; this draws and listens.
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
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys } from "../../screens/dialog-keys.ts";
import { element } from "../../screens/element.ts";
import { field } from "../../screens/new-project.ts";
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
const SEVERAL_LINES: ReadonlySet<TitlePageKey> = new Set(["Contact", "Notes"]);

/** How the one-line Author(s) box shows authors written on several lines. */
const AUTHOR_JOIN = ", ";

type Box = HTMLInputElement | HTMLTextAreaElement;

export function openTitlePageDialog(into: HTMLElement, options: TitlePageDialogOptions): HTMLDialogElement {
  const opened = formOf(options.titlePage);
  const boxes = new Map<TitlePageKey, Box>();
  // What each box showed on opening: a box still showing it is an untouched field.
  const shown = new Map<TitlePageKey, string>();

  const fields = new Map(
    TITLE_PAGE_KEYS.map((key) => {
      const id = `title-page-${key.toLowerCase().replace(/\s+/g, "-")}`;
      const value = key === "Author" ? opened.values[key].replaceAll("\n", AUTHOR_JOIN) : opened.values[key];
      // A value with several lines is never squashed: an input would drop its breaks.
      const box: Box =
        SEVERAL_LINES.has(key) || value.includes("\n")
          ? element("textarea", {
              id,
              className: `new-project-dialog__input title-page__lines${SEVERAL_LINES.has(key) ? " title-page__lines--long" : ""}`,
              rows: 2,
              spellcheck: false,
            })
          : element("input", { id, className: "new-project-dialog__input", type: "text", autocomplete: "off", spellcheck: false });
      box.value = value;
      boxes.set(key, box);
      shown.set(key, box.value);
      return [key, field(LABELS[key], box)];
    }),
  );
  const box = (key: TitlePageKey): Box => boxes.get(key)!;

  // View has no key of its own to promise.
  const view = dialogAction("View", undefined, "button");
  view.classList.add("title-page__view");
  const cancel = dialogAction("Cancel", "Esc", "button");
  const save = dialogAction("Save", "Enter", "submit");
  const problem = element("div", { className: "new-project__problem" });

  const list = element("div", { className: "title-page__fields" }, TITLE_PAGE_KEYS.map((key) => fields.get(key)!));
  const form = element("form", { className: "new-project-dialog__form" }, [
    list,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [view, cancel, save]),
  ]);
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog title-page", ariaLabel: "Edit Title Page" }, [form]);
  const keys = dialogKeys(modal, [...TITLE_PAGE_KEYS.map((key) => [box(key)]), [view, cancel, save]]);

  const areas = [...boxes.values()].filter((one) => one instanceof HTMLTextAreaElement);
  const long = areas.filter((area) => area.classList.contains("title-page__lines--long"));
  /**
   * Each text area as tall as its text. Contact and Notes share what the rest of
   * the dialog leaves of the window, so it is measured with them at their
   * smallest, and with the whole list, however little of it a short window shows.
   * Past the stylesheet's limit a box scrolls, and the form does not.
   */
  const fitLines = (): void => {
    const scrolled = areas.map((area) => area.scrollTop);
    const fit = (area: HTMLTextAreaElement): void =>
      area.style.setProperty("--title-lines-height", String(area.scrollHeight + area.offsetHeight - area.clientHeight));
    for (const area of areas) area.style.setProperty("--title-lines-height", "");
    for (const area of areas) if (!long.includes(area)) fit(area);
    const smallest = long.reduce((sum, area) => sum + area.offsetHeight, 0);
    modal.style.setProperty("--title-page-rest", String(list.scrollHeight + modal.offsetHeight - list.clientHeight - smallest));
    for (const area of long) fit(area);
    areas.forEach((area, at) => {
      area.scrollTop = scrolled[at]!;
    });
  };

  /** What the boxes hold now, applied to the title page opened. */
  const result = () => {
    const values = Object.fromEntries(
      TITLE_PAGE_KEYS.map((key) => [key, box(key).value === shown.get(key) ? opened.values[key] : box(key).value]),
    ) as Record<TitlePageKey, string>;
    const typed: TitlePageForm = { values };
    return applyForm(options.titlePage, typed);
  };
  const say = (words: string): void => {
    problem.replaceChildren(trouble(words));
    fitLines();
  };
  for (const one of boxes.values()) {
    one.addEventListener("input", () => {
      problem.replaceChildren();
      fitLines();
    });
  }

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
  // After `dialogKeys`, so this is only the Enter it left. Not `enterSubmits`:
  // in a text area being edited, plain Enter is a new line and Ctrl+Enter saves.
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.altKey) return;
    if (event.target instanceof HTMLTextAreaElement && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    // Not a held key: Enter still down from starting an edit must not save.
    if (!event.repeat) form.requestSubmit();
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
  fitLines();
  keys.edit(box("Title"));
  return modal;
}
