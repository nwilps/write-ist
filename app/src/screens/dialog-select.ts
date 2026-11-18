/**
 * A dialog's drop-down: a field that opens a tray of choices.
 *
 * Drawn rather than native so the tray can be Write-ist's: the right-click
 * menu's surface and rows (`.drop-menu--context`), and Home's `>` on the row the
 * eye is on. It is fixed to the window, as that menu is, so the dialog's edge
 * cannot clip it.
 *
 * The ARIA combobox pattern: focus stays on the field and the highlighted row is
 * named by `aria-activedescendant`. Closed, the field answers Enter and Space
 * and leaves the arrows to the dialog (`dialogKeys`). Open, it keeps the arrows,
 * Enter, Space and Escape; Tab closes it and moves on, changing nothing.
 *
 * A choice can be unavailable: drawn dimmed with its tag, so the writer can see
 * it is coming, but passed over by the arrows and deaf to the pointer. It can
 * never be the value.
 */
import { element } from "./element.ts";
import { cursor } from "./menu.ts";

export interface DialogChoice {
  readonly value: string;
  readonly label: string;
  /** The tag on a choice that cannot be picked yet, such as "soon". */
  readonly unavailable?: string;
}

export interface DialogSelectSpec {
  /** The field's id, for its `<label>`. */
  readonly id: string;
  /** What a screen reader calls the list. */
  readonly label: string;
  /** The first available one is chosen to begin with; there must be one. */
  readonly choices: readonly DialogChoice[];
}

export interface DialogSelect {
  /** The closed field. */
  readonly control: HTMLButtonElement;
  /** To go beside it, in the same box. */
  readonly tray: HTMLElement;
  readonly value: () => string;
}

interface Span {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the top of a tray goes: under the field, over it if there is no room
 * below, and held inside the window if it fits neither way.
 */
export function placeTray(field: Span, height: number, gap: number, windowHeight: number): number {
  const below = field.bottom;
  if (below + gap + height + gap <= windowHeight) return below;
  const above = field.top - height - gap * 2;
  if (above >= 0) return above;
  return Math.max(0, windowHeight - height - gap * 2);
}

export function dialogSelect({ id, label, choices }: DialogSelectSpec): DialogSelect {
  const shown = element("span");
  const control = element("button", {
    id,
    type: "button",
    className: "new-project-dialog__input dialog-select",
    role: "combobox",
  }, [shown]);
  const tray = element("div", {
    id: `${id}-list`,
    className: "drop-menu drop-menu--context dialog-select__tray",
    role: "listbox",
    ariaLabel: label,
    hidden: true,
  });
  control.setAttribute("aria-haspopup", "listbox");
  control.setAttribute("aria-controls", tray.id);
  control.setAttribute("aria-expanded", "false");

  const options = choices.map((choice, index) => {
    const option = element("div", { id: `${id}-option-${index}`, className: "drop-menu__item dialog-select__option", role: "option" }, [
      cursor(),
      element("span", { textContent: choice.label }),
    ]);
    if (choice.unavailable !== undefined) {
      option.classList.add("dialog-select__option--unavailable");
      option.setAttribute("aria-disabled", "true");
      option.append(element("span", { className: "drop-menu__hint", textContent: choice.unavailable }));
    }
    return option;
  });
  tray.append(...options);

  // The rows the arrows, the pointer and the keys can land on.
  const available = choices.flatMap((choice, index) => (choice.unavailable === undefined ? [index] : []));
  let chosen = available[0]!;
  let active = chosen;
  const isOpen = (): boolean => !tray.hidden;

  const choose = (index: number): void => {
    chosen = index;
    shown.textContent = choices[index]!.label;
    options.forEach((option, at) => option.setAttribute("aria-selected", String(at === index)));
  };

  const highlight = (index: number): void => {
    options[active]!.classList.remove("dialog-select__option--active");
    active = index;
    options[active]!.classList.add("dialog-select__option--active");
    control.setAttribute("aria-activedescendant", options[active]!.id);
    options[active]!.scrollIntoView?.({ block: "nearest" });
  };

  // A scroll anywhere but the tray's own list moves the field out from under it.
  const scrolled = ({ target }: Event): void => {
    if (target !== tray) close();
  };

  const place = (): void => {
    const field = control.getBoundingClientRect();
    // Measured numbers, handed to the stylesheet, which owns the unit.
    tray.style.setProperty("--menu-x", String(field.left));
    tray.style.setProperty("--menu-width", String(field.width));
    const gap = parseFloat(getComputedStyle(tray).marginTop) || 0;
    tray.style.setProperty("--menu-y", String(placeTray(field, tray.offsetHeight, gap, window.innerHeight)));
  };

  const open = (): void => {
    tray.hidden = false;
    control.setAttribute("aria-expanded", "true");
    place();
    highlight(chosen);
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", close);
  };

  function close(): void {
    if (!isOpen()) return;
    tray.hidden = true;
    control.setAttribute("aria-expanded", "false");
    control.removeAttribute("aria-activedescendant");
    document.removeEventListener("scroll", scrolled, true);
    window.removeEventListener("resize", close);
  }

  control.addEventListener("click", () => {
    control.focus();
    if (isOpen()) close();
    else open();
  });
  // Pressing anywhere else takes focus from the field, and that closes it.
  control.addEventListener("focusout", close);

  control.addEventListener("keydown", (event) => {
    const { key } = event;
    if (!isOpen()) {
      if ((key === "Enter" || key === " ") && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (key === "Tab") {
      close();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      const step = key === "ArrowDown" ? 1 : -1;
      highlight(available[(available.indexOf(active) + step + available.length) % available.length]!);
    } else if (key === "Enter" || key === " ") {
      choose(active);
      close();
    } else if (key === "Escape") {
      close();
    } else if (key !== "ArrowLeft" && key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
  });

  // Keep focus on the field through a press in the tray, or it would close first.
  tray.addEventListener("mousedown", (event) => event.preventDefault());
  available.forEach((index) => {
    const option = options[index]!;
    // Only a pointer that moved: a tray opening or scrolling under a still one
    // must not take the highlight from the keys.
    option.addEventListener("mousemove", ({ movementX, movementY }) => {
      if (index !== active && (movementX !== 0 || movementY !== 0)) highlight(index);
    });
    option.addEventListener("click", () => {
      choose(index);
      close();
    });
  });

  choose(chosen);
  return { control, tray, value: () => choices[chosen]!.value };
}
