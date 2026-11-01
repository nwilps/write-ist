/**
 * A drop-down menu (the desk design, §2.4): the one design File, Edit and View
 * share. A menu is **a row that opens a list of items** — the caller hands this
 * the row and the items, and gets the row back wrapped so the list can hang
 * beside it. What a menu *contains* is the caller's; how it looks, opens,
 * moves and closes is here, once, so Edit and View arrive as a list of items
 * and nothing else.
 *
 * These are application menus, not context menus: ADR-0034's right-click work
 * is separate and takes nothing over here.
 *
 * **Keyboard first, because a drawn menu has to do what a native one did**
 * (ADR-0034's largest cost). Enter, Space or the down arrow on the row opens it
 * and puts focus on the first item; the arrows, Home and End move; Enter or
 * Space chooses; Escape closes the menu *and nothing else* — the window answers
 * Escape by closing the project (`main.ts`), so it is stopped here. Tab leaves.
 * Alt plus the menu's letter opens it from anywhere. Outside a click closes it.
 * The roles are `menu`, `menuitem` and `separator`, so a screen reader hears a
 * menu.
 */
import { createElement, type IconNode } from "lucide";
import { element } from "../screens/element.ts";
import { asksForMenu } from "../screens/shortcuts.ts";

/** One thing a menu can do. */
export interface MenuItem {
  readonly label: string;
  /** The shortcut that does the same, as shown: `[Ctrl + S]`. Only ever one that works. */
  readonly hint?: string;
  /** A Lucide icon drawn before the label (ADR-0035). */
  readonly icon?: IconNode;
  readonly act: () => void;
  /** Drawn and doing nothing, and skipped by the arrow keys. */
  readonly unavailable?: boolean;
}

/** A rule between two groups of items. */
export interface MenuDivider {
  readonly divider: true;
}

export type MenuEntry = MenuItem | MenuDivider;

export interface MenuSpec {
  /** What a screen reader calls the menu: "File". */
  readonly label: string;
  /** The letter that opens it with Alt held, lowercase. */
  readonly access: string;
  readonly items: readonly MenuEntry[];
}

export interface DropMenu {
  /** The row and its list, to be put where the row goes. */
  readonly anchor: HTMLElement;
  readonly open: () => void;
  /** Close it; by default focus goes back to the row. */
  readonly close: (returnFocus?: boolean) => void;
  readonly isOpen: () => boolean;
  /** Stop listening for the access key. */
  readonly dispose: () => void;
}

const isDivider = (entry: MenuEntry): entry is MenuDivider => "divider" in entry;

/** Only one menu is open at a time; opening another closes this one. */
let showing: DropMenu | undefined;

/** Make `trigger` open `spec`'s items. */
export function dropMenu(trigger: HTMLButtonElement, spec: MenuSpec): DropMenu {
  const choices: HTMLButtonElement[] = [];
  const list = element("div", { className: "drop-menu", role: "menu", ariaLabel: spec.label, hidden: true });
  for (const entry of spec.items) {
    if (isDivider(entry)) {
      list.append(element("div", { className: "drop-menu__divider", role: "separator" }));
      continue;
    }
    const button = element("button", { type: "button", className: "drop-menu__item", role: "menuitem" });
    button.tabIndex = -1;
    button.disabled = entry.unavailable === true;
    if (entry.icon !== undefined) {
      const icon = createElement(entry.icon, { class: "drop-menu__icon" });
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    }
    button.append(element("span", { textContent: entry.label }));
    if (entry.hint !== undefined) {
      button.append(element("span", { className: "drop-menu__hint", textContent: entry.hint }));
    }
    button.addEventListener("click", () => {
      // Focus goes back first so that an action which moves it elsewhere wins.
      menu.close(true);
      entry.act();
    });
    choices.push(button);
    list.append(button);
  }
  const reachable = (): HTMLButtonElement[] => choices.filter((choice) => !choice.disabled);

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  const outsideClick = (event: Event): void => {
    if (event.target instanceof Node && anchor.contains(event.target)) return;
    menu.close(false);
  };

  const move = (by: number | "first" | "last"): void => {
    const here = reachable();
    if (here.length === 0) return;
    const at = here.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      by === "first" ? 0 : by === "last" ? here.length - 1 : (at + by + here.length) % here.length;
    here[next]?.focus();
  };

  list.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        move("first");
        break;
      case "End":
        move("last");
        break;
      case "Escape":
        // Closes the menu and stops there: the window would close the project.
        menu.close(true);
        break;
      case "Tab":
        // Leaves the menu, and the Tab goes on to do what a Tab does.
        menu.close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  trigger.addEventListener("click", () => (menu.isOpen() ? menu.close(true) : menu.open()));
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    menu.open();
    move(event.key === "ArrowDown" ? "first" : "last");
  });

  const asksFor = (event: KeyboardEvent): void => {
    if (!asksForMenu(event, spec.access)) return;
    event.preventDefault();
    event.stopPropagation();
    if (menu.isOpen()) menu.close(true);
    else menu.open();
  };
  // Capture, so the editor's own key handling never sees it.
  window.addEventListener("keydown", asksFor, true);

  const anchor = element("div", { className: "drop-menu-anchor" }, [trigger, list]);

  const menu: DropMenu = {
    anchor,
    open: () => {
      if (!list.hidden) return;
      if (showing !== undefined && showing !== menu) showing.close(false);
      showing = menu;
      list.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outsideClick, true);
      move("first");
    },
    close: (returnFocus = true) => {
      if (list.hidden) return;
      list.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outsideClick, true);
      if (showing === menu) showing = undefined;
      if (returnFocus) trigger.focus();
    },
    isOpen: () => !list.hidden,
    dispose: () => {
      menu.close(false);
      window.removeEventListener("keydown", asksFor, true);
    },
  };
  return menu;
}
