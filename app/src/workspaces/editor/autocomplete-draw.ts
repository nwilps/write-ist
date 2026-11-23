/**
 * The autocomplete offer, drawn (slice 2, step 9).
 *
 * The rest of the first choice as ghost text after the caret, and — when there
 * is more than one choice — a short list under it with the one Tab or Enter
 * would take marked. All of it is the DOM of a widget decoration
 * (`src/screenplay/autocomplete.ts`): never in the document, never in the
 * file, and not selectable or copyable as text on the paper.
 *
 * How it looks is `app/src/style/autocomplete.css`; this builds the parts, and
 * `placeOffer` lines the list up once it is on the paper.
 */
import type { Coords, Drawing } from "../../../../src/screenplay/autocomplete.ts";
import { element } from "../../screens/element.ts";
import { scrollerOf } from "./caret-margin.ts";

export function drawOffer(drawing: Drawing): HTMLElement {
  const ghost = element("span", { className: "autocomplete__ghost", textContent: drawing.ghost });
  const list =
    drawing.choices.length > 1
      ? [
          element(
            "span",
            { className: "drop-menu autocomplete__list" },
            drawing.choices.map((choice, at) =>
              element("span", {
                className:
                  at === drawing.selected
                    ? "drop-menu__item autocomplete__choice autocomplete__choice--selected"
                    : "drop-menu__item autocomplete__choice",
                textContent: choice.trimEnd(),
              }),
            ),
          ),
        ]
      : [];
  const offer = element("span", { className: "autocomplete", contentEditable: "false" }, [
    ghost,
    ...list,
  ]);
  offer.setAttribute("aria-hidden", "true");
  return offer;
}

/** A box on the window, in the window's own pixels. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Where the list goes, in the window's pixels: its left edge at `left` and its
 * top at `below`, the foot of the line it finishes, when that fits. Otherwise
 * moved only as far as it must to be seen: along, to the window's edge; and
 * **kept below the line** (Noah, 2026-11-21) by scrolling the paper up by what
 * it lacks, when the paper has that much left to scroll (`scrollable`). Only
 * when it has not — the very end of the script — does the list go up above
 * the line (its top at `line`) rather than over it. `scroll` is how far the
 * paper must move first; `top` is where the list is once it has.
 */
export function placeList(
  wanted: { readonly left: number; readonly below: number; readonly line: number },
  list: Size,
  window: Size,
  scrollable = 0,
): { left: number; top: number; scroll: number } {
  const left = Math.max(0, Math.min(wanted.left, window.width - list.width));
  const short = wanted.below + list.height - window.height;
  if (short <= 0) return { left, top: wanted.below, scroll: 0 };
  // Not so far that the line itself goes off the top.
  const scroll = Math.ceil(short);
  if (scroll <= scrollable && scroll <= wanted.line) return { left, top: wanted.below - scroll, scroll };
  const above = wanted.line - list.height;
  if (above >= 0) return { left, top: above, scroll: 0 };
  return { left, top: Math.max(0, window.height - list.height), scroll: 0 };
}

/**
 * Lines the drawn list up (`AutocompleteOptions.place`): **its left edge with
 * the left edge of the name** it finishes (Noah, 2026-11-21) — the cue's
 * indent, or where a dual-dialogue cue's centring has put it, as drawn — and
 * kept on the window.
 *
 * The list hangs from the caret by the stylesheet; this measures how far that
 * is from where it belongs and hands the difference over as numbers, which
 * the stylesheet owns the unit of. **Measured on the window and moved on the
 * paper**: the window sees the paper at View ▸ Zoom's size, while the list's
 * `left` is in the paper's own pixels, so the difference is divided by how
 * large the paper is drawn — read off the list itself, its width on the
 * window over its width on the paper. That also makes the shift the same at
 * every zoom: the paper is laid out once and only drawn larger or smaller.
 *
 * **Measured in the next frame**, before it is painted: the caret is scrolled
 * into view after the redraw this follows, and a list measured before that
 * was put where the line had been — off by the scroll, found in WebKit with
 * the paper scrolled sideways.
 */
export function placeOffer(drawn: HTMLElement, start: () => Coords | undefined): void {
  const view = drawn.ownerDocument.defaultView;
  if (view === null) return;
  view.requestAnimationFrame(() => {
    if (drawn.isConnected) lineUp(drawn, start, view);
  });
}

function lineUp(drawn: HTMLElement, start: () => Coords | undefined, view: Window): void {
  const list = drawn.querySelector<HTMLElement>(".autocomplete__list");
  if (list === null) return;
  // Back where the stylesheet hangs it, to measure from there.
  list.style.setProperty("--offer-x", "0");
  list.style.setProperty("--offer-y", "0");
  const hung = list.getBoundingClientRect();
  // Not laid out (a window with no layout, or hidden): nothing to line up.
  if (list.offsetWidth === 0 || hung.width === 0) return;
  const scale = hung.width / list.offsetWidth;
  const line = drawn.getBoundingClientRect();
  const scroller = scrollerOf(drawn);
  const placed = placeList(
    { left: start()?.left ?? hung.left, below: hung.top, line: line.top },
    { width: hung.width, height: hung.height },
    { width: view.innerWidth, height: view.innerHeight },
    scroller === undefined ? 0 : scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop,
  );
  // The paper moves up under the list's own line; the list goes with it.
  if (placed.scroll > 0) scroller!.scrollTop += placed.scroll;
  list.style.setProperty("--offer-x", String((placed.left - hung.left) / scale));
  list.style.setProperty("--offer-y", String((placed.top + placed.scroll - hung.top) / scale));
}
