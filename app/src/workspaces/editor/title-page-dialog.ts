/**
 * Edit Title Page and View Title Page: one dialog with two faces.
 *
 * Edit has one box per title-page key, prefilled from the manuscript. View is
 * the title page as it prints, filling the dialog. **They are one `<dialog>`,**
 * and the boxes keep their place under the page while it shows, so the two are
 * the same size in the same spot however tall the boxes make it, and the button
 * that switches them never moves. Ctrl+E does what that button does, from
 * anywhere, a box being typed in included.
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
 *
 * Going from Edit to View saves first, exactly as Save does: nothing is written
 * if nothing changed, and a problem keeps Edit showing with the problem said.
 * So View only ever shows the title page as saved, never typing that is not,
 * and the dialog stays open. Coming back to Edit saves nothing more.
 *
 * View opens with nothing focused, as Goals does: Escape closes at once, and Tab
 * or an arrow steps onto the buttons. Close and Escape put the whole dialog away;
 * what View showed was already saved, so nothing is lost with it.
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
import { chordMatches, type Chord } from "../../screens/shortcuts.ts";
import { trouble } from "../../screens/trouble.ts";
import { titlePagePreview } from "./title-page-preview.ts";

export interface TitlePageDialogOptions {
  readonly titlePage: readonly TitlePageField[];
  /** The new title page, only when it differs from the one opened. */
  readonly save: (titlePage: readonly TitlePageField[]) => void;
  readonly closed: () => void;
  /** The face it opens on. Default `edit`. */
  readonly opensOn?: "edit" | "view";
}

/** Switches between the faces. */
const SWITCH: Chord = { key: "e", mod: true };

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
  // The title page as last saved: the one opened, until going to View saves another.
  let saved = options.titlePage;
  let opened = formOf(saved);
  const boxes = new Map<TitlePageKey, Box>();
  // What each box showed when last saved: a box still showing it is an untouched field.
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

  // One button each, relabelled: the same element is the same pixels on both faces.
  const toggle = dialogAction("View", "Ctrl+E", "button");
  toggle.classList.add("title-page__toggle");
  const leave = dialogAction("Cancel", "Esc", "button");
  const save = dialogAction("Save", "Enter", "submit");
  const problem = element("div", { className: "new-project__problem" });
  const page = element("div", { className: "title-page__print", hidden: true });

  const list = element("div", { className: "title-page__fields" }, TITLE_PAGE_KEYS.map((key) => fields.get(key)!));
  const form = element("form", { className: "new-project-dialog__form" }, [
    list,
    problem,
    element("div", { className: "new-project-dialog__actions" }, [toggle, leave, save]),
  ]);
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog title-page", ariaLabel: "Edit Title Page" }, [page, form]);

  let viewing = false;
  // Where Edit picks up again: the box last in use.
  let lastBox = box("Title");

  const relabel = (button: HTMLButtonElement, label: string): void => {
    button.querySelector("span:not(.gesture__cursor)")!.textContent = label;
  };
  const showFace = (): void => {
    modal.classList.toggle("title-page--view", viewing);
    modal.ariaLabel = viewing ? "View Title Page" : "Edit Title Page";
    list.toggleAttribute("inert", viewing);
    page.hidden = !viewing;
    save.hidden = viewing;
    relabel(toggle, viewing ? "Edit" : "View");
    relabel(leave, viewing ? "Close" : "Cancel");
  };
  const showPage = (titlePage: readonly TitlePageField[]): void => {
    viewing = true;
    problem.replaceChildren();
    page.replaceChildren(...titlePagePreview(titlePage));
    // Before the boxes go inert, so one being edited stops being edited and
    // the next Escape closes the dialog.
    modal.focus();
    showFace();
  };
  const showBoxes = (): void => {
    viewing = false;
    showFace();
    keys.edit(lastBox);
  };

  // Before `dialogKeys`, which leaves a used key alone: from the dialog itself,
  // where View opens, every arrow steps onto the buttons.
  modal.addEventListener("keydown", (event) => {
    if (!viewing || event.target !== modal || !event.key.startsWith("Arrow")) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    toggle.focus();
  });
  const keys = dialogKeys(modal, [...TITLE_PAGE_KEYS.map((key) => [box(key)]), [toggle, leave, save]]);

  /** What the boxes hold now, applied to the title page as last saved. */
  const result = () => {
    const values = Object.fromEntries(
      TITLE_PAGE_KEYS.map((key) => [
        key,
        savedLines(box(key).value) === savedLines(shown.get(key)!) ? opened.values[key] : box(key).value,
      ]),
    ) as Record<TitlePageKey, string>;
    const typed: TitlePageForm = { values };
    return applyForm(saved, typed);
  };
  const say = (words: string): void => {
    problem.replaceChildren(trouble(words));
  };
  for (const one of boxes.values()) {
    one.addEventListener("input", () => problem.replaceChildren());
  }
  /** Save what the boxes hold, as Save does; `false` if there is a problem, said. */
  const commit = (): boolean => {
    const applied = result();
    if ("problem" in applied) {
      say(applied.problem);
      return false;
    }
    // Nothing changed: nothing is written, not even an equal write.
    if (sameTitlePage(applied.titlePage, saved)) return true;
    options.save(applied.titlePage);
    saved = applied.titlePage;
    opened = formOf(saved);
    for (const [key, one] of boxes) shown.set(key, one.value);
    return true;
  };

  // A short window cuts the list, and a browser leaves a half-shown box half shown.
  list.addEventListener("focusin", (event) => {
    lastBox = event.target as Box;
    (event.target as HTMLElement).closest(".new-project-dialog__field")?.scrollIntoView?.({ block: "nearest" });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (viewing) return;
    if (commit()) modal.close();
  });
  // After `dialogKeys`, so this is only the Enter it left. Not `enterSubmits`:
  // in a text area being edited, plain Enter is a new line and Ctrl+Enter saves.
  modal.addEventListener("keydown", (event) => {
    if (viewing || event.key !== "Enter" || event.defaultPrevented || event.altKey) return;
    if (event.target instanceof HTMLTextAreaElement && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    // Not a held key: Enter still down from starting an edit must not save.
    if (!event.repeat) form.requestSubmit();
  });
  // Heard here, so it works from a box being typed in. Not a held key: the faces
  // must not flicker while it is down.
  modal.addEventListener("keydown", (event) => {
    if (!chordMatches(SWITCH, event)) return;
    event.preventDefault();
    if (!event.repeat) toggle.click();
  });
  // To View saves first, as Save does, so the page is what is saved; a problem stays on Edit.
  toggle.addEventListener("click", () => {
    if (viewing) {
      showBoxes();
      return;
    }
    if (commit()) showPage(saved);
  });
  leave.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  into.append(modal);
  modal.showModal();
  // From the menu the page is what is saved, exactly.
  if (options.opensOn === "view") showPage(options.titlePage);
  else keys.edit(box("Title"));
  return modal;
}
