/**
 * Edit Title Page: one box per title-page key, prefilled from the manuscript.
 *
 * New Project's dialog, built from its pieces, its shared buttons and keys among
 * them: a modal `<dialog>` with no heading, and Escape cancels it natively. The
 * boxes are stacked, one to a row, in a dialog tall enough to show them all.
 *
 * Enter in a one-line box saves. Title, Author(s) and Source are two lines,
 * Contact three and Notes four: fixed text areas that scroll their own text,
 * and so is any other value that already has more than one line. There Enter
 * is a new line and Ctrl+Enter saves.
 *
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

/** The boxes that are always text areas, and the lines each always shows. */
const FIXED_LINES: Readonly<Partial<Record<TitlePageKey, number>>> = { Title: 2, Author: 2, Source: 2, Contact: 3, Notes: 4 };

/** The most lines any other box shows, when its value already has several. */
const MOST_OTHER_LINES = 4;

type Box = HTMLInputElement | HTMLTextAreaElement;

/** A box's text as it would be saved: blank lines and outer spaces do not count. */
const savedLines = (text: string): string =>
  text.split("\n").map((line) => line.trim()).filter((line) => line !== "").join("\n");

export function openTitlePageDialog(into: HTMLElement, options: TitlePageDialogOptions): HTMLDialogElement {
  const opened = formOf(options.titlePage);
  const boxes = new Map<TitlePageKey, Box>();
  // What each box showed on opening: a box still showing it is an untouched field.
  const shown = new Map<TitlePageKey, string>();

  const fields = new Map(
    TITLE_PAGE_KEYS.map((key) => {
      const id = `title-page-${key.toLowerCase().replace(/\s+/g, "-")}`;
      const value = opened.values[key];
      const fixedLines = FIXED_LINES[key];
      // A value with several lines is never squashed: an input would drop its breaks.
      const box: Box =
        fixedLines !== undefined || value.includes("\n")
          ? element("textarea", {
              id,
              className: `new-project-dialog__input title-page__lines${fixedLines !== undefined ? ` title-page__lines--${fixedLines}` : ""}`,
              rows: fixedLines ?? Math.min(value.split("\n").length, MOST_OTHER_LINES),
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

  /** What the boxes hold now, applied to the title page opened. */
  const result = () => {
    const values = Object.fromEntries(
      TITLE_PAGE_KEYS.map((key) => [
        key,
        savedLines(box(key).value) === savedLines(shown.get(key)!) ? opened.values[key] : box(key).value,
      ]),
    ) as Record<TitlePageKey, string>;
    const typed: TitlePageForm = { values };
    return applyForm(options.titlePage, typed);
  };
  const say = (words: string): void => {
    problem.replaceChildren(trouble(words));
  };
  for (const one of boxes.values()) {
    one.addEventListener("input", () => problem.replaceChildren());
  }

  // A short window cuts the list, and a browser leaves a half-shown box half shown.
  list.addEventListener("focusin", (event) => {
    (event.target as HTMLElement).closest(".new-project-dialog__field")?.scrollIntoView?.({ block: "nearest" });
  });

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
  keys.edit(box("Title"));
  return modal;
}
