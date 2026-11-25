/**
 * A drop-down menu (the desk design, §2.4): the one design File, Edit and View
 * share. A menu is **a row that opens a list of items** — the caller hands this
 * the row and the items, and gets the row back wrapped so the list can hang
 * beside it. What a menu *contains* is the caller's; how it looks, opens,
 * moves and closes is here, once, so Edit and View arrive as a list of items
 * and nothing else.
 *
 * The list is `menuList`, which the context menu (`context-menu.ts`, ADR-0034)
 * draws too: one look and one set of keys for every menu Write-ist has.
 *
 * **Keyboard first, because a drawn menu has to do what a native one did**
 * (ADR-0034's largest cost). Enter, Space or the down arrow on the row opens it
 * and puts focus on the first item; the arrows, Home and End move; Enter or
 * Space chooses; Escape closes the menu *and nothing else* — the window answers
 * Escape by closing the project (`main.ts`), so it is stopped here. Tab leaves.
 * Alt plus the menu's letter opens it from anywhere. Outside a click closes it.
 * The roles are `menu`, `menuitem` and `separator`, so a screen reader hears a
 * menu.
 *
 * **An item may carry a second action at its end** (`aside`: Delete beside a
 * note's name in Notes' folder menu) — a small icon of its own, chosen by the
 * pointer, or by Delete or Backspace while its item has focus. An item that is
 * unavailable keeps its second action: it is greyed and does nothing itself,
 * but can still be reached, so its icon can still be chosen.
 *
 * **A row of steps** (View ▸ Zoom) is an item with − and + at its end and a dot
 * for each step between them. Choosing − or + steps and leaves the menu open,
 * so the writer sees each step land; with the row focused, Left and Right press
 * them, and Up and Down move on as from any item.
 */
import { Check, createElement, Minus, Plus, type IconNode } from "lucide";
import { element } from "../screens/element.ts";
import { asksForMenu, isCapturedKey } from "../screens/shortcuts.ts";

/** One thing a menu can do. */
export interface MenuItem {
  readonly label: string;
  /**
   * The shortcut that does the same, as shown: `[Ctrl + S]`. Only ever one that
   * works. A function is asked each time the menu opens, so a key the writer
   * has just changed is the one shown.
   */
  readonly hint?: string | (() => string | undefined);
  /** A Lucide icon drawn before the label (ADR-0035). */
  readonly icon?: IconNode;
  readonly act: () => void;
  /**
   * Drawn and doing nothing, and skipped by the arrow keys — unless it has an
   * `aside`, which still works: then it is greyed, and the arrows still stop on it.
   */
  readonly unavailable?: boolean;
  /**
   * An item that is on or off (Spellcheck). Asked each time the menu opens, so
   * the mark is true when the writer looks.
   */
  readonly checked?: () => boolean;
  /**
   * A second action, drawn as a small icon at the item's end: chosen by the
   * pointer on the icon, or by Delete or Backspace on the item. `alarm` draws
   * it in the alarm colour under the pointer, for an action that destroys.
   */
  readonly aside?: MenuAside;
}

/** An item's second action (`MenuItem.aside`). */
export interface MenuAside {
  /** What a screen reader calls it: "Delete Ideas". */
  readonly label: string;
  readonly icon: IconNode;
  readonly act: () => void;
  readonly alarm?: boolean;
}

/** A rule between two groups of items. */
export interface MenuDivider {
  readonly divider: true;
}

/** One end of a row of steps: what a screen reader calls it, and what it does. */
export interface MenuStep {
  readonly label: string;
  readonly act: () => void;
}

/** A row of steps: − (`less`) and + (`more`), and a dot for each step. */
export interface MenuStepper {
  readonly label: string;
  readonly icon?: IconNode;
  readonly less: MenuStep;
  readonly more: MenuStep;
  /** Which step it is on, of how many, smallest first. Asked when the menu opens and after each step. */
  readonly at: () => { readonly index: number; readonly count: number };
}

export type MenuEntry = MenuItem | MenuDivider | MenuStepper;

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

/** An item's hint as it would be shown now, if it has one. */
export const hintNow = (item: MenuItem): string | undefined =>
  typeof item.hint === "function" ? item.hint() : item.hint;

const isDivider = (entry: MenuEntry): entry is MenuDivider => "divider" in entry;
const isStepper = (entry: MenuEntry): entry is MenuStepper => "less" in entry;

/** Anything that can be told to close, for the rule that only one menu is open. */
interface Closable {
  readonly close: (returnFocus?: boolean) => void;
}

/** Only one menu is open at a time; opening another closes this one. */
let showing: Closable | undefined;

/** Make `menu` the one that is open, closing whichever was. */
export function claimMenu(menu: Closable): void {
  if (showing !== undefined && showing !== menu) showing.close(false);
  showing = menu;
}

/** Say `menu` has closed. */
export function releaseMenu(menu: Closable): void {
  if (showing === menu) showing = undefined;
}

/** The list a menu draws, and what the keyboard does in it. */
export interface MenuList {
  readonly list: HTMLElement;
  /** Ask each ticked item whether it is on, so the marks are true when the writer looks. */
  readonly refresh: () => void;
  /** Move focus: by a step, or to the first or last item that can be chosen. */
  readonly move: (by: number | "first" | "last") => void;
}

/**
 * The list itself — items, rules, icons, ticks, hints, and the arrow keys —
 * which the drop-down menus and the context menu share, so that they look and
 * behave as one design. `close` is what choosing an item, Escape and Tab do to
 * the menu; what *opens* it is the caller's.
 */
export function menuList(
  spec: Pick<MenuSpec, "label" | "items">,
  close: (returnFocus: boolean) => void,
): MenuList {
  const choices: HTMLElement[] = [];
  const marks: (() => void)[] = [];
  const list = element("div", { className: "drop-menu", role: "menu", ariaLabel: spec.label, hidden: true });
  // Focusable, so a menu opened by the pointer can still be walked by the arrows.
  list.tabIndex = -1;
  for (const entry of spec.items) {
    if (isDivider(entry)) {
      list.append(element("div", { className: "drop-menu__divider", role: "separator" }));
      continue;
    }
    if (isStepper(entry)) {
      const row = stepperRow(entry);
      marks.push(row.refresh);
      choices.push(row.row);
      list.append(row.row);
      continue;
    }
    const button = element("button", { type: "button", className: "drop-menu__item", role: "menuitem" });
    button.tabIndex = -1;
    // Unavailable with a second action: greyed but reachable, so the action can still be chosen.
    const greyed = entry.unavailable === true && entry.aside !== undefined;
    button.disabled = entry.unavailable === true && !greyed;
    if (greyed) button.setAttribute("aria-disabled", "true");
    if (entry.icon !== undefined) {
      const icon = createElement(entry.icon, { class: "drop-menu__icon" });
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
    }
    button.append(element("span", { textContent: entry.label }));
    if (entry.checked !== undefined) {
      button.setAttribute("role", "menuitemcheckbox");
      const mark = createElement(Check, { class: "drop-menu__check" });
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
      marks.push(() => {
        const on = entry.checked!();
        button.setAttribute("aria-checked", String(on));
        mark.toggleAttribute("hidden", !on);
      });
    }
    const { hint } = entry;
    if (typeof hint === "string") {
      button.append(element("span", { className: "drop-menu__hint", textContent: hint }));
    } else if (hint !== undefined) {
      const shown = element("span", { className: "drop-menu__hint" });
      button.append(shown);
      marks.push(() => {
        shown.textContent = hint() ?? "";
        shown.hidden = shown.textContent === "";
      });
    }
    const { aside } = entry;
    if (aside !== undefined) {
      // A span, not a button: a button cannot be inside another.
      const end = element("span", {
        className: aside.alarm === true ? "drop-menu__aside drop-menu__aside--alarm" : "drop-menu__aside",
        role: "button",
        ariaLabel: aside.label,
      });
      end.append(createElement(aside.icon, { class: "drop-menu__icon", "aria-hidden": "true" }));
      end.addEventListener("mousedown", (event) => event.preventDefault());
      end.addEventListener("click", (event) => {
        // The icon's own, not the item's.
        event.stopPropagation();
        close(true);
        aside.act();
      });
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
        aside.act();
      });
      button.append(end);
    }
    button.addEventListener("click", () => {
      if (greyed) return;
      // Focus goes back first so that an action which moves it elsewhere wins.
      close(true);
      entry.act();
    });
    choices.push(button);
    list.append(button);
  }
  const reachable = (): HTMLElement[] =>
    choices.filter((choice) => !(choice instanceof HTMLButtonElement && choice.disabled));

  const move = (by: number | "first" | "last"): void => {
    const here = reachable();
    if (here.length === 0) return;
    const at = here.indexOf(document.activeElement as HTMLElement);
    // Focus on the list and not on an item (a menu opened by the pointer): down
    // goes to the first item and up to the last.
    const next =
      by === "first"
        ? 0
        : by === "last"
          ? here.length - 1
          : at < 0
            ? by > 0
              ? 0
              : here.length - 1
            : (at + by + here.length) % here.length;
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
        close(true);
        break;
      case "Tab":
        // Leaves the menu, and the Tab goes on to do what a Tab does.
        close(true);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  return { list, refresh: () => marks.forEach((mark) => mark()), move };
}

/**
 * A row of steps, and how to make its dots true. It is focused as one item;
 * − and + are reached by the pointer, or by Left and Right on the row.
 */
function stepperRow(entry: MenuStepper): { readonly row: HTMLElement; readonly refresh: () => void } {
  const row = element("div", { className: "drop-menu__item drop-menu__stepper", role: "menuitem" });
  row.tabIndex = -1;
  if (entry.icon !== undefined) {
    const icon = createElement(entry.icon, { class: "drop-menu__icon" });
    icon.setAttribute("aria-hidden", "true");
    row.append(icon);
  }
  row.append(element("span", { textContent: entry.label }));
  const steps = element("span", { className: "drop-menu__steps" });
  steps.setAttribute("aria-hidden", "true");
  const end = (step: MenuStep, drawn: IconNode): HTMLButtonElement => {
    const button = element("button", { type: "button", className: "drop-menu__step", ariaLabel: step.label });
    button.tabIndex = -1;
    button.append(createElement(drawn, { class: "drop-menu__icon", "aria-hidden": "true" }));
    // The row keeps the focus, so the arrows go on from it.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => press(step));
    return button;
  };
  const less = end(entry.less, Minus);
  const more = end(entry.more, Plus);

  const refresh = (): void => {
    const { index, count } = entry.at();
    row.setAttribute("aria-label", `${entry.label}, ${index + 1} of ${count}`);
    less.setAttribute("aria-disabled", String(index <= 0));
    more.setAttribute("aria-disabled", String(index >= count - 1));
    steps.replaceChildren(
      less,
      ...Array.from({ length: count }, (_, at) =>
        element("span", { className: at === index ? "drop-menu__dot drop-menu__dot--on" : "drop-menu__dot" }),
      ),
      more,
    );
  };
  // Not closing: the menu stays open to watch the step land.
  const press = (step: MenuStep): void => {
    step.act();
    refresh();
    row.focus();
  };
  row.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    press(event.key === "ArrowLeft" ? entry.less : entry.more);
  });
  row.append(steps);
  refresh();
  return { row, refresh };
}

/** Make `trigger` open `spec`'s items. */
export function dropMenu(trigger: HTMLButtonElement, spec: MenuSpec): DropMenu {
  const { list, refresh, move } = menuList(spec, (returnFocus) => menu.close(returnFocus));

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  const outsideClick = (event: Event): void => {
    if (event.target instanceof Node && anchor.contains(event.target)) return;
    menu.close(false);
  };

  trigger.addEventListener("click", () => (menu.isOpen() ? menu.close(true) : menu.open()));
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    menu.open();
    move(event.key === "ArrowDown" ? "first" : "last");
  });

  const asksFor = (event: KeyboardEvent): void => {
    if (!asksForMenu(event, spec.access) || isCapturedKey(event)) return;
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
      claimMenu(menu);
      refresh();
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
      releaseMenu(menu);
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
