/**
 * A dialog's button, lit as the home screen's selected row is lit.
 *
 * At rest it is quiet. Under the pointer or holding focus it wears Home's
 * highlight, gold text and `>`, from the same rules (`home.css`) and the same
 * `cursor()`, so the two cannot drift. `.new-project-dialog__action` still gives
 * it its size and place in the row.
 */
import { element } from "./element.ts";
import { cursor } from "./menu.ts";

const ACTION = "dialog-action";

/** `> Label [Key]`, for the row of buttons at the foot of a dialog. */
export function dialogAction(label: string, key: string, kind: "submit" | "button"): HTMLButtonElement {
  const button = element("button", { className: `new-project-dialog__action ${ACTION}`, type: kind }, [
    cursor(),
    element("span", { textContent: label }),
    element("span", { ariaHidden: "true", textContent: `[${key}]` }),
  ]);
  // As on Home: hover takes focus from the button the keys left it on, so only
  // one is ever lit. A field keeps its focus, or the pointer would stop the typing.
  button.addEventListener("mouseenter", () => {
    const held = button.ownerDocument.activeElement;
    if (held !== button && held?.classList.contains(ACTION) === true && !button.disabled) {
      button.focus({ preventScroll: true });
    }
  });
  return button;
}
