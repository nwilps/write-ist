/**
 * The autocomplete offer, drawn (slice 2, step 9).
 *
 * The rest of the first choice as ghost text after the caret, and — when there
 * is more than one choice — a short list under it with the one Tab or Enter
 * would take marked. All of it is the DOM of a widget decoration
 * (`src/screenplay/autocomplete.ts`): never in the document, never in the
 * file, and not selectable or copyable as text on the paper.
 *
 * How it looks is `app/src/style/autocomplete.css`; this builds the parts.
 */
import type { Drawing } from "../../../../src/screenplay/autocomplete.ts";
import { element } from "../../screens/element.ts";

export function drawOffer(drawing: Drawing): HTMLElement {
  const ghost = element("span", { className: "autocomplete__ghost", textContent: drawing.ghost });
  const list =
    drawing.choices.length > 1
      ? [
          element(
            "span",
            { className: "autocomplete__list" },
            drawing.choices.map((choice, at) =>
              element("span", {
                className:
                  at === drawing.selected
                    ? "autocomplete__choice autocomplete__choice--selected"
                    : "autocomplete__choice",
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
