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
import { LEAVE, type Gesture } from "./shortcuts.ts";

/** Draw a column of gestures. */
export function menu(gestures: readonly Gesture[]): HTMLElement {
  return element(
    "ul",
    { className: "menu" },
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
