/**
 * Keyboard Shortcuts: a glance at the keys that matter while writing.
 *
 * Read-only. Every row is generated from the command table (`commands.ts`):
 * a command with a key is listed, under the group it belongs to, with the same
 * hint the menus draw beside it (`hintOf`). A command with no key is not, and
 * nothing is listed that the table does not answer, so this list and the keys
 * cannot drift apart.
 *
 * Below the list, the Tab circuit: the order Tab and Shift+Tab step a line's
 * element type through, read from the screenplay surface's own `TAB_CYCLE`.
 * It is its own section and its own helper, so it can be taken out whole.
 *
 * New Project's dialog, built from its pieces, its shared button and keys among
 * them: a modal `<dialog>` with no heading, Escape closes it natively, and it
 * opens with nothing focused, as Goals does. Its own key closes it again.
 */
import { TAB_CYCLE } from "../../../../src/screenplay/element-keys.ts";
import { dialogAction } from "../../screens/dialog-action.ts";
import { dialogKeys } from "../../screens/dialog-keys.ts";
import { element } from "../../screens/element.ts";
import { chordMatches } from "../../screens/shortcuts.ts";
import { COMMANDS, commandById, hintOf, type Command } from "./commands.ts";

export interface KeyboardShortcutsDialogOptions {
  readonly closed: () => void;
}

/** The small labels the rows are grouped under, in the order they are drawn. */
export type ShortcutGroupName = "File" | "Edit" | "View" | "Writing";

export interface ShortcutRow {
  readonly label: string;
  /** `[Ctrl + S]`: the hint the menus draw. */
  readonly hint: string;
}

export interface ShortcutGroup {
  readonly name: ShortcutGroupName;
  readonly rows: readonly ShortcutRow[];
}

/** The id of the command that opens this dialog, whose key also closes it. */
export const KEYBOARD_SHORTCUTS = "keyboard-shortcuts";

/**
 * Where a command is listed: under its menu, the clipboard with Edit, and
 * everything else with a key (the element types, Search) under Writing.
 */
function groupOf(command: Command): ShortcutGroupName {
  if (command.menu !== undefined) return command.menu.name;
  if (command.context?.group === "clipboard") return "Edit";
  return "Writing";
}

/** Every command with a key, grouped, in table order within each group. */
export function shortcutGroups(): readonly ShortcutGroup[] {
  const names: readonly ShortcutGroupName[] = ["File", "Edit", "View", "Writing"];
  return names.map((name) => ({
    name,
    rows: COMMANDS.flatMap((command) => {
      const hint = hintOf(command);
      return hint === undefined || groupOf(command) !== name ? [] : [{ label: command.label, hint }];
    }),
  }));
}

/** The element types Tab steps through, by the names the command table gives them. */
export function tabCircuit(): readonly string[] {
  return TAB_CYCLE.map((type) => commandById(`element-${type}`)?.label ?? type);
}

const keyPill = (hint: string): HTMLElement => element("span", { className: "shortcuts__key", textContent: hint });

function drawGroup(group: ShortcutGroup): HTMLElement {
  return element("section", { className: "shortcuts__group" }, [
    element("h2", { className: "new-project-dialog__label shortcuts__label", textContent: group.name }),
    element(
      "ul",
      { className: "shortcuts__rows" },
      group.rows.map((row) =>
        element("li", { className: "shortcuts__row" }, [element("span", { textContent: row.label }), keyPill(row.hint)]),
      ),
    ),
  ]);
}

/** The Tab circuit: a section of its own, so dropping it is deleting this and its call. */
function drawTabCircuit(): HTMLElement {
  const steps = tabCircuit().map((label, at) =>
    element("li", { className: "shortcuts-circuit__step" }, [
      ...(at === 0 ? [] : [element("span", { className: "shortcuts-circuit__arrow", ariaHidden: "true", textContent: "→" })]),
      element("span", { textContent: label }),
      // And round again, to the first.
      ...(at === TAB_CYCLE.length - 1 ? [element("span", { className: "shortcuts-circuit__arrow", ariaHidden: "true", textContent: "↺" })] : []),
    ]),
  );
  return element("section", { className: "shortcuts-circuit" }, [
    element("div", { className: "shortcuts__row" }, [
      element("h2", { className: "new-project-dialog__label shortcuts__label", textContent: "Tab circuit" }),
      element("span", { className: "shortcuts-circuit__keys" }, [keyPill("[Tab]"), keyPill("[Shift + Tab]")]),
    ]),
    element("ol", { className: "shortcuts-circuit__steps", ariaLabel: "Tab steps forward, Shift+Tab back, and both go round" }, steps),
  ]);
}

export function openKeyboardShortcutsDialog(into: HTMLElement, options: KeyboardShortcutsDialogOptions): HTMLDialogElement {
  const groups = shortcutGroups();
  const column = (names: readonly ShortcutGroupName[]): HTMLElement =>
    element("div", { className: "shortcuts__column" }, groups.filter((group) => names.includes(group.name)).map(drawGroup));

  // Esc, because it closes from anywhere; the dialog's own key is in the list.
  const close = dialogAction("Close", "Esc", "button");
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  const modal = element("dialog", { className: "new-project-dialog shortcuts", ariaLabel: "Keyboard Shortcuts" }, [
    element("div", { className: "new-project-dialog__form" }, [
      element("div", { className: "shortcuts__columns" }, [column(["File", "Edit"]), column(["View", "Writing"])]),
      element("div", { className: "drop-menu__divider", role: "separator" }),
      drawTabCircuit(),
      element("div", { className: "drop-menu__divider", role: "separator" }),
      element("div", { className: "new-project-dialog__actions" }, [close]),
    ]),
  ]);
  dialogKeys(modal, [[close]]);

  // Heard here too, so the key that opened it closes it from anywhere inside.
  // Not a held key: the dialog must not flicker while it is down.
  const own = commandById(KEYBOARD_SHORTCUTS)?.chord;
  modal.addEventListener("keydown", (event) => {
    if (own === undefined || !chordMatches(own, event)) return;
    event.preventDefault();
    if (!event.repeat) modal.close();
  });
  close.addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    modal.remove();
    options.closed();
  });

  into.append(modal);
  modal.showModal();
  // Nothing is assumed: no control lit, and the focus still inside the dialog.
  modal.focus();
  return modal;
}
