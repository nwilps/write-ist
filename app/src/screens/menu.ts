/**
 * A menu of gestures, drawn.
 *
 * Both screens are menus — the home screen is nothing else — so the drawing is
 * in one place and the two cannot drift. v1's shape: a column of labelled
 * items, each with its letter beside it and a `>` where the eye is.
 *
 * **Real buttons.** The indicator is decoration and the letter is a hint; the
 * label is what a screen reader reads and what Enter, Tab and the space bar
 * already act on without a line of code here.
 */
import { element } from "./element.ts";
import { LEAVE, stepped, type Gesture, type KeyPress } from "./shortcuts.ts";

/**
 * Draw a column of gestures. `home` is the home screen's look (the home
 * design): centred rows, the first one selected until the eye moves.
 */
export function menu(gestures: readonly Gesture[], { home = false } = {}): HTMLElement {
  return element(
    "ul",
    { className: home ? "menu menu--home" : "menu" },
    gestures.map((gesture) => element("li", { className: "menu__item" }, [item(gesture)])),
  );
}

/** Draw gestures in a row, for the foot of a screen that is mostly a list. */
export function menuRow(gestures: readonly Gesture[]): HTMLElement {
  return element(
    "div",
    { className: "menu menu--row" },
    gestures.map((gesture) => item(gesture)),
  );
}

/** The class on the row the highlight is on. */
const SELECTED = "gesture--selected";

/**
 * Give a drawn home menu a highlight the keyboard can move.
 *
 * One row is selected at a time, the first to begin with. The mouse moves it
 * (hover), focus moves it (Tab), and Up and Down move it, wrapping at the ends;
 * the keys also move focus, so a screen reader follows the eye. Enter acts on
 * the selected row, as a click would. The answer says whether the key was used.
 */
export function navigable(
  list: HTMLElement,
  gestures: readonly Gesture[],
): (press: KeyPress) => boolean {
  const buttons = [...list.querySelectorAll<HTMLButtonElement>("button.gesture")];
  let selected = 0;
  const select = (index: number): void => {
    buttons[selected]?.classList.remove(SELECTED);
    selected = index;
    buttons[selected]?.classList.add(SELECTED);
  };
  select(0);
  buttons.forEach((button, index) => {
    // Hover takes focus too, so the row the keys left focused lets go of it.
    button.addEventListener("mouseenter", () => {
      select(index);
      button.focus({ preventScroll: true });
    });
    button.addEventListener("focus", () => select(index));
  });

  return (press) => {
    if (press.key === "Enter" && !press.ctrlKey && !press.metaKey && !press.altKey) {
      const gesture = gestures[selected];
      if (gesture === undefined || gesture.unavailable === true) return false;
      gesture.act();
      return true;
    }
    const to = stepped(gestures, selected, press);
    if (to === undefined) return false;
    select(to);
    buttons[to]?.focus();
    return true;
  };
}

function item(gesture: Gesture): HTMLButtonElement {
  const button = element(
    "button",
    { className: "gesture", type: "button", disabled: gesture.unavailable === true },
    [
      // The `>` v1 put beside the item the eye is on. Hidden from a screen
      // reader, which is told by focus instead.
      hidden(element("span", { className: "gesture__cursor", textContent: ">" })),
      element("span", { className: "gesture__label", textContent: gesture.label }),
      hidden(element("span", { className: "gesture__key", textContent: `[${legend(gesture)}]` })),
    ],
  );
  button.addEventListener("click", gesture.act);
  return button;
}

/** What the letter looks like on the page. */
function legend({ key }: Gesture): string {
  return key === LEAVE ? "esc" : key;
}

function hidden<T extends HTMLElement>(node: T): T {
  node.setAttribute("aria-hidden", "true");
  return node;
}
