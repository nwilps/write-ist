/**
 * The right-click menu (ADR-0034): Write-ist's own, in the look of File, Edit
 * and View — it is drawn from the same `menuList` (`drop-menu.ts`), so the
 * items, icons, hints and arrow keys are one design, and what is added here is
 * only *where it appears and when it goes away*.
 *
 * It opens **at the pointer** (or at the caret, for the Menu key), is kept
 * inside the window by flipping to the other side of the point and then
 * clamping, and closes on Escape, a press outside it, a scroll, the window
 * losing focus or resizing, or choosing an item. Escape closes the menu and
 * nothing else, as it does for the drop-downs.
 */
import { claimMenu, menuList, releaseMenu, type MenuEntry } from "./drop-menu.ts";

export interface ContextMenuSpec {
  /** What a screen reader calls the menu. */
  readonly label: string;
  readonly items: readonly MenuEntry[];
  /** Where the writer pointed, in window coordinates. */
  readonly x: number;
  readonly y: number;
  /** Opened from the keyboard: focus goes to the first item, as in a drop-down. */
  readonly fromKeyboard?: boolean;
  /** Where focus goes when the menu closes and asks for it (the paper). */
  readonly restoreFocus: () => void;
}

export interface ContextMenu {
  readonly close: (returnFocus?: boolean) => void;
  readonly isOpen: () => boolean;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Where the top-left corner of a menu of `size` goes so that it opens at
 * `point` and stays inside `window`: on the other side of the point if it
 * would run off the right or bottom edge, and held at the edge if it still
 * does not fit.
 */
export function placeMenu(
  point: { readonly x: number; readonly y: number },
  size: Size,
  window: Size,
): { readonly left: number; readonly top: number } {
  const fit = (at: number, length: number, room: number): number => {
    const placed = at + length > room ? at - length : at;
    return Math.max(0, Math.min(placed, room - length));
  };
  return { left: fit(point.x, size.width, window.width), top: fit(point.y, size.height, window.height) };
}

export function openContextMenu(spec: ContextMenuSpec): ContextMenu {
  const { list, refresh, move } = menuList({ label: spec.label, items: spec.items }, (returnFocus) =>
    menu.close(returnFocus),
  );
  list.classList.add("drop-menu--context");

  // A press outside closes it without taking focus back: the press has put
  // focus where the writer pointed. Right-click is the same, and the
  // contextmenu that follows opens a new menu there.
  const outsidePress = (event: Event): void => {
    if (event.target instanceof Node && list.contains(event.target)) return;
    menu.close(false);
  };
  const leaves = (): void => menu.close(true);
  // The window itself losing focus, not an element inside it.
  const windowLeaves = (event: Event): void => {
    if (event.target === window) menu.close(false);
  };

  const menu: ContextMenu = {
    close: (returnFocus = true) => {
      if (!list.isConnected) return;
      document.removeEventListener("pointerdown", outsidePress, true);
      // Capture: a scroll does not bubble, and the paper is what scrolls.
      document.removeEventListener("scroll", leaves, true);
      window.removeEventListener("resize", leaves);
      window.removeEventListener("blur", windowLeaves);
      list.remove();
      releaseMenu(menu);
      if (returnFocus) spec.restoreFocus();
    },
    isOpen: () => list.isConnected,
  };

  claimMenu(menu);
  refresh();
  list.hidden = false;
  // Put in at the corner to be measured, then moved: both before the browser paints.
  document.body.append(list);
  const placed = placeMenu(
    { x: spec.x, y: spec.y },
    { width: list.offsetWidth, height: list.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  // Measured numbers, handed to the stylesheet, which owns the unit.
  list.style.setProperty("--menu-x", String(placed.left));
  list.style.setProperty("--menu-y", String(placed.top));

  document.addEventListener("pointerdown", outsidePress, true);
  document.addEventListener("scroll", leaves, true);
  window.addEventListener("resize", leaves);
  window.addEventListener("blur", windowLeaves);

  // Focus on the menu so the arrows work; the first item only when the
  // keyboard asked, so a pointer-opened menu has nothing lit until it is used.
  list.focus({ preventScroll: true });
  if (spec.fromKeyboard === true) move("first");
  return menu;
}
