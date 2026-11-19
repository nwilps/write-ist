/**
 * Walking a dialog from the keyboard.
 *
 * The caller lists its controls as rows, top to bottom, each row left to right.
 * Tab and Shift+Tab go through them all and wrap, so focus stays in the dialog.
 * Up and Down move between rows, Left and Right along one, wrapping too. What
 * cannot be used right now (a disabled Confirm) is stepped over.
 *
 * **A text field is either focused or being edited.** Focused, it is one more
 * stop: the arrows pass through it. Clicking it, Enter, or typing starts the
 * edit; the arrows then move the caret, and Escape or leaving the field ends it.
 *
 * **A control that uses a key says so with `preventDefault`** and is left alone,
 * which is how an open `dialogSelect` keeps the arrows and Escape. Escape that
 * nobody used is the `<dialog>`'s own, and cancels it. Enter that nobody used
 * confirms the dialog (`enterSubmits`).
 */

export interface DialogKeys {
  /** Put focus in a text field, ready to type. */
  readonly edit: (field: HTMLElement) => void;
}

const STEPS: Readonly<Record<string, { readonly rows: number; readonly along: number }>> = {
  ArrowUp: { rows: -1, along: 0 },
  ArrowDown: { rows: 1, along: 0 },
  ArrowLeft: { rows: 0, along: -1 },
  ArrowRight: { rows: 0, along: 1 },
};

const isTextField = (node: EventTarget | null): node is HTMLElement =>
  node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;

const usable = (control: HTMLElement): boolean =>
  !control.matches(":disabled") && control.closest("[hidden]") === null;

/** The place `by` steps from `index`, going round. */
const around = (index: number, by: number, length: number): number => (index + by + length) % length;

export function dialogKeys(modal: HTMLDialogElement, rows: readonly (readonly HTMLElement[])[]): DialogKeys {
  let editing: HTMLElement | undefined;
  let escapeUsed = false;
  // The control last on in each row, to come back to it from above or below.
  const lastIn = new Map<readonly HTMLElement[], HTMLElement>();

  const setEditing = (field: HTMLElement | undefined): void => {
    editing?.classList.remove("dialog-keys__editing");
    editing = field;
    editing?.classList.add("dialog-keys__editing");
  };

  const tab = (from: EventTarget | null, back: boolean): void => {
    const stops = rows.flat().filter(usable);
    if (stops.length === 0) return;
    const at = stops.indexOf(from as HTMLElement);
    const start = at < 0 && back ? 0 : at;
    stops[around(start, back ? -1 : 1, stops.length)]!.focus();
  };

  const stepRows = (from: EventTarget | null, by: number): void => {
    const open = rows.filter((row) => row.some(usable));
    if (open.length === 0) return;
    const at = open.findIndex((row) => row.includes(from as HTMLElement));
    const row = open[around(at < 0 && by < 0 ? 0 : at, by, open.length)]!;
    if (row.includes(from as HTMLElement)) return;
    const last = lastIn.get(row);
    (last !== undefined && usable(last) ? last : row.find(usable)!).focus();
  };

  const stepAlong = (from: EventTarget | null, by: number): void => {
    const row = rows.find((candidates) => candidates.includes(from as HTMLElement))?.filter(usable);
    if (row === undefined || row.length < 2) return;
    row[around(row.indexOf(from as HTMLElement), by, row.length)]!.focus();
  };

  // Focusable, so a click on the dialog's empty space leaves the keys working here.
  modal.tabIndex = -1;
  modal.classList.add("dialog-keys");

  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!event.defaultPrevented && editing !== undefined) {
        setEditing(undefined);
        event.preventDefault();
      }
      escapeUsed = event.defaultPrevented;
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Tab") {
      event.preventDefault();
      tab(event.target, event.shiftKey);
      return;
    }
    if (event.defaultPrevented) return;
    const { target } = event;
    if (event.key === "Enter") {
      if (isTextField(target) && target !== editing) {
        event.preventDefault();
        setEditing(target);
      } else if (target instanceof HTMLButtonElement) {
        event.preventDefault();
        // Not a held key: Enter still down from a file picker must not press Confirm.
        if (!event.repeat) target.click();
      }
      return;
    }
    const step = STEPS[event.key];
    if (step === undefined || (editing !== undefined && target === editing)) return;
    event.preventDefault();
    if (step.rows !== 0) stepRows(target, step.rows);
    else stepAlong(target, step.along);
  });

  // The webview may not honour `preventDefault` on the key, so the Escape that
  // something else used is refused here as well: the dialog must stay.
  modal.addEventListener("cancel", (event) => {
    if (escapeUsed) event.preventDefault();
    escapeUsed = false;
  });

  // `mousedown` for a press in the field, `click` for one on its label.
  for (const gesture of ["mousedown", "click", "input"]) {
    modal.addEventListener(gesture, ({ target }) => {
      if (isTextField(target)) setEditing(target);
    });
  }
  modal.addEventListener("focusin", ({ target }) => {
    const row = rows.find((candidates) => candidates.includes(target as HTMLElement));
    if (row !== undefined) lastIn.set(row, target as HTMLElement);
  });
  modal.addEventListener("focusout", ({ target }) => {
    // Still the active element means the window lost focus, not the field.
    if (target === editing && modal.ownerDocument.activeElement !== editing) setEditing(undefined);
  });

  return {
    edit: (field) => {
      field.focus();
      setEditing(field);
    },
  };
}

/**
 * Enter confirms from the field being edited. Everywhere else it has already
 * been used: to start editing, to press a button, or by a drop-down. Call this
 * after `dialogKeys`, so that it hears what was used.
 */
export function enterSubmits(modal: HTMLDialogElement, form: HTMLFormElement): void {
  modal.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    form.requestSubmit();
  });
}
