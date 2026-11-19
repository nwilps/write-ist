/**
 * Keyboard Shortcuts: a glance at the keys that matter while writing.
 *
 * Read-only. Every row is generated from the command table (`commands.ts`):
 * a command with a key is listed, under the group it belongs to, with the same
 * hint the menus draw beside it (`hintOf`). A command with no key is not, and
 * nothing is listed that the table does not answer, so this list and the keys
 * cannot drift apart.
 *
 * Under Writing, Tab Order: the loop Tab and Shift+Tab step a line's element
 * type round, read from the screenplay surface's own `TAB_CYCLE`. It is its own
 * section and its own helper, so it can be taken out whole.
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

/** A key, drawn as the bottom bar's pills are: for reading, not for pressing. */
const keyPill = (hint: string): HTMLElement => element("span", { className: "pill shortcuts__key", textContent: hint });

function drawGroup(group: ShortcutGroup, after: readonly HTMLElement[] = []): HTMLElement {
  return element("section", { className: "shortcuts__group" }, [
    element("h2", { className: "new-project-dialog__label shortcuts__label", textContent: group.name }),
    element(
      "ul",
      { className: "shortcuts__rows" },
      group.rows.map((row) =>
        element("li", { className: "shortcuts__row" }, [element("span", { textContent: row.label }), keyPill(row.hint)]),
      ),
    ),
    ...after,
  ]);
}

/** A piece of the loop's drawing: lines and arrowheads, which a screen reader skips. */
const drawn = (className: string): HTMLElement => element("span", { className, ariaHidden: "true" });

/** A curve with an arrowhead on its end, drawn whole: the arrowhead is its child. */
const arrow = (className: string, head: string): HTMLElement =>
  element("span", { className, ariaHidden: "true" }, [drawn(head)]);

/**
 * Tab Order: the element types top to bottom, drawn as a loop. On the right, a
 * short arrow of its own for each step, out of one name and into the next,
 * with a gap before the next arrow starts. On the left, one long arrow out of
 * the last and back into the first. A section of its own, so dropping it is
 * deleting this and its call.
 */
function drawTabOrder(): HTMLElement {
  const last = TAB_CYCLE.length - 1;
  const steps = tabCircuit().map((label, at) =>
    element("li", { className: "shortcuts-loop__step" }, [
      element("span", { className: "shortcuts-loop__name", textContent: label }),
      // Every name but the last steps on to the next.
      ...(at === last ? [] : [arrow("shortcuts-loop__step-arrow", "shortcuts-loop__head")]),
    ]),
  );
  return element("section", { className: "shortcuts-tab-order" }, [
    element("div", { className: "shortcuts-tab-order__head" }, [
      element("h3", { className: "new-project-dialog__label shortcuts__label", textContent: "Tab Order" }),
      element("span", { className: "shortcuts-tab-order__keys" }, [keyPill("[Tab]"), keyPill("[Shift + Tab]")]),
    ]),
    element("div", { className: "shortcuts-loop" }, [
      arrow("shortcuts-loop__return", "shortcuts-loop__head shortcuts-loop__head--back"),
      element("ol", { className: "shortcuts-loop__steps", ariaLabel: "Tab steps forward, Shift+Tab back, and both go round" }, steps),
    ]),
  ]);
}

export function openKeyboardShortcutsDialog(into: HTMLElement, options: KeyboardShortcutsDialogOptions): HTMLDialogElement {
  const groups = shortcutGroups();
  const group = (name: ShortcutGroupName): ShortcutGroup => groups.find((one) => one.name === name)!;
  const column = (children: readonly HTMLElement[]): HTMLElement => element("div", { className: "shortcuts__column" }, children);

  // Esc, because it closes from anywhere; the dialog's own key is in the list.
  const close = dialogAction("Close", "Esc", "button");
  // No heading, as New Project has none; the dialog is still named for a screen reader.
  // File, Edit and View down one side; Writing, the longest, alone on the other.
  const modal = element("dialog", { className: "new-project-dialog shortcuts", ariaLabel: "Keyboard Shortcuts" }, [
    element("div", { className: "new-project-dialog__form" }, [
      element("div", { className: "shortcuts__columns" }, [
        column((["File", "Edit", "View"] as const).map((name) => drawGroup(group(name)))),
        element("div", { className: "shortcuts__divider", role: "separator", ariaOrientation: "vertical" }),
        column([drawGroup(group("Writing"), [drawTabOrder()])]),
      ]),
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
