/**
 * Edit ▸ Character List and Edit ▸ Location List: the names this project's
 * autocomplete offers, in a dialog set like Settings ▸ Dictionary — one field
 * that finds as it is typed in and adds what it holds, then a cell for each
 * name with its Remove (Noah, 2026-11-21).
 *
 * - **Add** puts the name on the list: autocomplete offers it at once.
 * - **Remove** deletes the name from the list: autocomplete stops offering it.
 *   The cues or headings already in the script do not put it back; only a new
 *   one typed later does (`NameLists.remove`).
 *
 * Neither says anything: the list redrawn is the answer. The manuscript is
 * never touched. Each row keeps room beside Remove for a Replace that is not
 * built yet (`.name-list__actions`).
 *
 * A modal `<dialog>` with no heading, as Settings' is, named for a screen
 * reader; Escape or Done closes it.
 */
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys } from "../../screens/dialog-keys.ts";
import { element } from "../../screens/element.ts";
import { cell, emptyLine, onEnterWhileEditing, rowAction } from "../../screens/settings.ts";

export interface NameListDialogOptions {
  /** "Character List" or "Location List": the dialog's name. */
  readonly title: string;
  /** What one entry is called, in the field's words: "character", "location". */
  readonly noun: string;
  /** The names the list holds now, by name. */
  readonly names: () => readonly string[];
  /** Add one; answers whether it was added. */
  readonly add: (name: string) => boolean;
  /** Remove one; answers whether it was removed. */
  readonly remove: (name: string) => boolean;
  /** The dialog is gone, however it went. */
  readonly closed: () => void;
}

/** A name as the lists keep it: capitals, single-spaced (`normaliseName`). */
const asListed = (typed: string): string => typed.replace(/\s+/g, " ").trim().toUpperCase();

export function openNameListDialog(into: HTMLElement, options: NameListDialogOptions): HTMLDialogElement {
  const field = element("input", {
    id: "name-list-name",
    className: "new-project-dialog__input",
    type: "text",
    placeholder: `Find or add a ${options.noun}`,
    autocomplete: "off",
    spellcheck: false,
  });
  const add = rowAction("Add");
  const list = element("ul", { className: "settings__list name-list__list", ariaLabel: options.title });
  const done = dialogAction("Done", "Esc", "button");

  /** What the keys walk: the field and Add, each name's actions, then Done. Rebuilt in place. */
  const rows: HTMLElement[][] = [];
  let nameRows: HTMLElement[][] = [];
  const refreshRows = (): void => void rows.splice(0, rows.length, [field, add], ...nameRows, [done]);

  const listed = (name: string): boolean => options.names().includes(name);
  const settleAdd = (): void => {
    const name = asListed(field.value);
    add.disabled = name === "" || listed(name);
  };
  function draw(): void {
    const filter = asListed(field.value);
    const names = options.names();
    const matching = names.filter((name) => name.includes(filter));
    nameRows = [];
    list.replaceChildren(
      ...matching.map((name) => {
        const remove = rowAction("Remove");
        remove.setAttribute("aria-label", `Remove ${name}`);
        const controls: HTMLElement[] = [remove];
        nameRows.push(controls);
        remove.addEventListener("click", () => {
          const at = nameRows.indexOf(controls);
          options.remove(name);
          draw();
          // On to the name that took its place, or back to the field.
          (nameRows[Math.min(at, nameRows.length - 1)]?.[0] ?? field).focus();
        });
        return cell([
          element("span", { className: "settings__row-name", textContent: name }),
          // Replace will sit here, before Remove; the room is kept for it.
          element("span", { className: "name-list__actions" }, [remove]),
        ]);
      }),
      ...(names.length === 0 ? [emptyLine(`No ${options.noun} names yet.`)] : []),
    );
    settleAdd();
    refreshRows();
  }
  const addName = (): void => {
    const name = asListed(field.value);
    if (name === "" || listed(name)) return;
    options.add(name);
    field.value = "";
    draw();
    keys.edit(field);
  };
  field.addEventListener("input", draw);
  onEnterWhileEditing(field, addName);
  add.addEventListener("click", addName);

  const modal = element("dialog", { className: "new-project-dialog name-list", ariaLabel: options.title }, [
    element("div", { className: "new-project-dialog__form" }, [
      element("div", { className: "new-project-dialog__field" }, [
        element("label", { htmlFor: field.id, className: "new-project-dialog__label", textContent: options.title }),
        element("div", { className: "settings__line" }, [element("div", { className: "new-project-dialog__box settings__grow" }, [field]), add]),
      ]),
      element("div", { className: "name-list__scroll" }, [list]),
      element("div", { className: "new-project-dialog__actions" }, [done]),
    ]),
  ]);
  draw();
  const keys = dialogKeys(modal, rows);

  done.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  into.append(modal);
  modal.showModal();
  keys.edit(field);
  return modal;
}
