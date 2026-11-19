/**
 * A dialog's on/off switch: a small sliding toggle, gold when on and dim when off.
 *
 * A button in the `switch` role, so `dialogKeys` treats it as one more stop: the
 * arrows move on, Escape closes, and it is never "being edited". Enter reaches
 * it through `dialogKeys`, which presses any button; Space is answered here.
 * Give it a `<label>` for its id, and pressing the label presses the switch.
 */
import { element } from "./element.ts";

export interface DialogToggleSpec {
  /** The switch's id, for its `<label>`. */
  readonly id: string;
  /** The writer flipped it. */
  readonly onChange: (on: boolean) => void;
}

export interface DialogToggle {
  readonly control: HTMLButtonElement;
  readonly on: () => boolean;
  /** Show this state, without counting as the writer's choice. */
  readonly set: (on: boolean) => void;
}

export function dialogToggle({ id, onChange }: DialogToggleSpec): DialogToggle {
  const control = element("button", { id, type: "button", className: "dialog-toggle", role: "switch" });
  const on = (): boolean => control.getAttribute("aria-checked") === "true";
  const set = (value: boolean): void => control.setAttribute("aria-checked", String(value));

  control.addEventListener("click", () => {
    // A click need not focus a button, and the focus may be in something this is about to disable.
    control.focus();
    set(!on());
    onChange(on());
  });
  control.addEventListener("keydown", (event) => {
    if (event.key !== " " || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (!event.repeat) control.click();
  });

  set(false);
  return { control, on, set };
}
