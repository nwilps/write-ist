/**
 * A list that scrolls without a scrollbar, in a window with a chevron for what
 * is out of view: **up** above the list when rows have scrolled off the top,
 * **down** below it when rows are waiting under the bottom, neither when
 * everything fits. The Open Project list and a dialog's drop-down both use it.
 *
 * The list draws no scrollbar, so these are what say it scrolls. They sit in
 * the room the caller leaves around the list, never over a row, and are for
 * the eye only: hidden from a screen reader, which hears the whole list
 * anyway, and never in the pointer's way — a click or right-click there lands
 * on what is underneath. Nothing about them is clickable.
 *
 * **What is out of view is read off the rows, not the scroll counters.** The
 * first row's top above the list's, or the last row's bottom below it, by more
 * than `edgeTolerance`. `scrollTop`, `scrollHeight` and `clientHeight` are
 * whole numbers, each rounded on its own, and in WebKitGTK at a scale that is
 * not a whole number of device pixels they disagree: at 1.1, the list wheeled,
 * arrowed or scrolled as far as it goes reads 160 + 248 of 409, a pixel that
 * can never be reached, and the down chevron stayed at the very bottom (Noah,
 * after testing; ADR-0043). A row's box is not rounded, so at the bottom the
 * last row's sits within a fraction of a pixel of the list's.
 *
 * **But a chevron also goes when the list cannot move that way.** A row's box
 * alone can leave one stuck: if the last row still sits past the list's bottom
 * at the end of the scroll, no scroll will ever bring it in (Noah, the drop-down
 * tray). So each end asks both, and either answer hides its chevron, the
 * counters allowed the same tolerance so their stray pixel cannot hold one up.
 *
 * The list's own scroll event keeps them right however it moved — the wheel,
 * a trackpad, the arrows bringing a row into view — and so does the list
 * changing size or rows. `hint` is for the caller who has changed something
 * else: refitted the list, or just shown it.
 */
import { ChevronDown, ChevronUp, createElement, type IconNode } from "lucide";
import { element } from "./element.ts";

export interface ScrollWindow {
  readonly window: HTMLElement;
  readonly hint: () => void;
}

/** `list` must have no border or padding: its box is the window rows show in. */
export function scrollWindow(list: HTMLElement, className: string): ScrollWindow {
  const above = scrollHint(ChevronUp, "above");
  const below = scrollHint(ChevronDown, "below");
  const hint = (): void => {
    const first = list.firstElementChild;
    const last = list.lastElementChild;
    if (first === null || last === null) {
      above.hidden = below.hidden = true;
      return;
    }
    const view = list.getBoundingClientRect();
    const edge = edgeTolerance();
    const leftBelow = list.scrollHeight - list.clientHeight - list.scrollTop;
    above.hidden = view.top - first.getBoundingClientRect().top <= edge || list.scrollTop <= edge;
    below.hidden = last.getBoundingClientRect().bottom - view.bottom <= edge || leftBelow <= edge;
  };
  list.addEventListener("scroll", hint, { passive: true });
  list.addEventListener("scrollend", hint, { passive: true });
  // A list taller or shorter, or rows come and gone, can change what is out of view.
  if (typeof ResizeObserver === "function") new ResizeObserver(hint).observe(list);
  if (typeof MutationObserver === "function") new MutationObserver(hint).observe(list, { childList: true });
  hint();
  return { window: element("div", { className }, [above, list, below]), hint };
}

/**
 * How far a row may sit past the list's edge and still count as in view, and
 * how little scroll may be left and still count as none: a CSS pixel, or one
 * device pixel where that is more (a display scaled below 1).
 * Anything less is rounding — no scroll the writer could make would show it —
 * and a single row is 24px, so nothing worth scrolling to hides inside it.
 */
export function edgeTolerance(ratio = window.devicePixelRatio): number {
  return ratio > 0 ? Math.max(1, 1 / ratio) : 1;
}

/** One of the list's chevrons: Lucide's drawing, at the icon size (ADR-0035). */
function scrollHint(icon: IconNode, where: "above" | "below"): HTMLElement {
  const hint = element("span", { className: `projects-hint projects-hint--${where}`, ariaHidden: "true" }, [
    createElement(icon, { class: "projects-hint__icon" }),
  ]);
  hint.hidden = true;
  return hint;
}
