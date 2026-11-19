/**
 * The New Project button on the home screen, and the dialog it opens.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { chosenBy } from "../../app/src/screens/shortcuts.ts";
import { dialogSelect, placeTray } from "../../app/src/screens/dialog-select.ts";
import { showNewProject } from "../../app/src/screens/new-project.ts";

// jsdom has no modal dialog.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("Home", () => {
  it("offers New Project first, above Open Project", () => {
    const into = document.createElement("div");
    const onNewProject = vi.fn();
    const { gestures } = renderHome(into, { onNewProject, onOpenProject: () => {}, onQuit: () => {} });
    expect(gestures.map((g) => g.label)).toEqual(["New Project", "Open Project", "Metrics", "Settings", "Quit"]);
    const labels = [...into.querySelectorAll(".gesture__label")].map((n) => n.textContent);
    expect(labels).toEqual(["New Project", "Open Project", "Metrics", "Settings", "Quit"]);
    (into.querySelector("button.gesture") as HTMLButtonElement).click();
    expect(onNewProject).toHaveBeenCalledTimes(1);
  });
});

describe("Home, as designed", () => {
  it("draws the tagline, a rule above and below the menu, and selects the first row", () => {
    const into = document.createElement("div");
    renderHome(into, {
      onNewProject: () => {},
      onOpenProject: () => {},
      onQuit: () => {},
      ghostwriter: { reducedMotion: true },
    });
    expect(into.querySelector(".tagline")!.textContent).toBe("A calm place to write.");
    const rules = [...into.querySelectorAll(".home-rule")];
    expect(rules.map((r) => r.textContent)).toEqual(["\u2500".repeat(42), "\u2500".repeat(42)]);
    expect(into.querySelector(".menu")!.classList.contains("menu--home")).toBe(true);
    // Rule, menu, rule: in that order.
    const order = [...into.querySelector(".composition")!.children].map((c) => c.className.split(" ")[0]);
    expect(order).toEqual(["wordmark", "tagline", "home-rule", "menu", "home-rule"]);
  });
});

describe("Home, Metrics and Settings", () => {
  it("are drawn between Open Project and Quit, with their keys, and do nothing", () => {
    const into = document.createElement("div");
    const calls = { n: vi.fn(), o: vi.fn(), q: vi.fn() };
    const { gestures } = renderHome(into, { onNewProject: calls.n, onOpenProject: calls.o, onQuit: calls.q });
    expect(gestures.map((g) => `${g.label} [${g.key}]`)).toEqual([
      "New Project [n]", "Open Project [o]", "Metrics [m]", "Settings [s]", "Quit [q]",
    ]);
    const buttons = [...into.querySelectorAll<HTMLButtonElement>("button.gesture")];
    expect(buttons.map((b) => b.querySelector(".gesture__key")!.textContent)).toEqual(["[n]", "[o]", "[m]", "[s]", "[q]"]);
    // Enabled, so hover and focus reach them like any row; not marked unavailable.
    for (const i of [2, 3]) {
      expect(buttons[i]!.disabled).toBe(false);
      expect(gestures[i]!.unavailable).not.toBe(true);
      buttons[i]!.click();
      gestures[i]!.act();
    }
    expect(calls.n).not.toHaveBeenCalled();
    expect(calls.o).not.toHaveBeenCalled();
    expect(calls.q).not.toHaveBeenCalled();
  });

  it("are chosen by their keys, and the choice does nothing", () => {
    const into = document.createElement("div");
    const { gestures } = renderHome(into, { onNewProject: () => {}, onOpenProject: () => {}, onQuit: () => {} });
    const press = (key: string) => ({ key, altKey: false, ctrlKey: false, metaKey: false });
    expect(chosenBy(gestures, press("m"))?.label).toBe("Metrics");
    expect(chosenBy(gestures, press("s"))?.label).toBe("Settings");
    expect(() => chosenBy(gestures, press("m"))!.act()).not.toThrow();
  });

  it("are not dimmed: the home menu paints every row muted and has no dimmer rule", () => {
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).toMatch(/\.menu--home \.gesture \{[^}]*color: var\(--colour-muted\)/);
    const menuRules = css.match(/[^{}]*\.menu--home[^{}]*\{[^}]*\}/g)!.join("\n");
    expect(menuRules).not.toMatch(/nth-child|opacity/);
  });
});

afterEach(() => {
  document.body.replaceChildren();
});

function dialog(onCreate = vi.fn(async () => undefined as string | undefined)) {
  // In the document, so that focus is real.
  const into = document.body.appendChild(document.createElement("div"));
  const onClose = vi.fn();
  const modal = showNewProject(into, { onCreate, onClose });
  const title = modal.querySelector("#new-project-title") as HTMLInputElement;
  const type = modal.querySelector("#new-project-type") as HTMLButtonElement;
  const tray = modal.querySelector(".dialog-select__tray") as HTMLElement;
  const list = modal.querySelector("[role=listbox]") as HTMLElement;
  const [cancel, create] = modal.querySelectorAll<HTMLButtonElement>(".new-project-dialog__actions button") as unknown as [
    HTMLButtonElement,
    HTMLButtonElement,
  ];
  const type_ = (text: string) => {
    title.value = text;
    title.dispatchEvent(new Event("input"));
  };
  const submit = () => modal.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  /** A key, as the focused control gets it. The answer is the event: was it used? */
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  return { into, modal, title, type, tray, list, create, cancel, type_, submit, press, onCreate, onClose };
}

describe("the New Project dialog", () => {
  it("offers the eight project types in order, with Feature chosen, and a title", () => {
    const { type, list, title } = dialog();
    expect([...list.querySelectorAll("[role=option]")].map((o) => o.firstElementChild!.textContent)).toEqual([
      "Feature",
      "Episode",
      "Short Film",
      "Novel",
      "Short Story",
      "Novella",
      "Flash Fiction",
      "Poem",
    ]);
    expect(type.textContent).toBe("Feature");
    expect(title.value).toBe("");
  });

  it("keeps Confirm disabled until a title is entered", () => {
    const { create, type_ } = dialog();
    expect(create.disabled).toBe(true);
    type_("   ");
    expect(create.disabled).toBe(true);
    type_("Big Fish");
    expect(create.disabled).toBe(false);
  });

  it("has no heading, and labels its two buttons with their keys, Cancel first", () => {
    const { modal, create, cancel } = dialog();
    expect(modal.querySelector("h1, h2, h3")).toBeNull();
    expect(modal.getAttribute("aria-label")).toBe("New Project");
    expect([...modal.querySelectorAll("label")].map((l) => l.textContent)).toEqual([
      "Project type",
      "Project title",
    ]);
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(create.textContent).toBe(">Confirm[Enter]");
    const buttons = [...modal.querySelectorAll(".new-project-dialog__actions button")];
    expect(buttons).toEqual([cancel, create]);
  });

  it("hints Untitled without pre-filling it", () => {
    const { title } = dialog();
    expect(title.placeholder).toBe("Untitled");
    expect(title.value).toBe("");
  });

  it("confirms on Enter in the title, and rejects Enter when it is empty", async () => {
    const { modal, title, type_, onCreate, onClose } = dialog();
    const enter = () =>
      title.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    enter();
    expect(onCreate).not.toHaveBeenCalled();
    type_("Big Fish");
    enter();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
    expect(modal.hasAttribute("open")).toBe(false);
  });

  it("cancels on Escape, creating nothing", () => {
    const { modal, onCreate, onClose } = dialog();
    const escape = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    modal.close();
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("does not confirm an empty title on Enter", () => {
    const { submit, onCreate } = dialog();
    submit();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("confirms with the type and the title, and closes when it was made", async () => {
    const { type_, submit, onCreate, onClose, modal } = dialog();
    type_("Big Fish");
    submit();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
    expect(modal.hasAttribute("open")).toBe(false);
  });

  it("says a failure plainly and stays open, so the title can be changed", async () => {
    const { type_, submit, modal, onClose, create } = dialog(vi.fn(async () => "No room on the disk."));
    type_("Big Fish");
    submit();
    await vi.waitFor(() => expect(modal.querySelector("[role=alert]")).not.toBeNull());
    expect(modal.querySelector("[role=alert]")!.textContent).toBe("No room on the disk.");
    expect(modal.hasAttribute("open")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(create.disabled).toBe(false);
  });

  it("cancels with the Cancel button, creating nothing", () => {
    const { cancel, onCreate, onClose } = dialog();
    cancel.click();
    expect(onClose).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("is a modal dialog, so Escape cancels it natively", () => {
    const { modal, into } = dialog();
    expect(modal.tagName).toBe("DIALOG");
    expect(into.contains(modal)).toBe(true);
  });
});

describe("the New Project buttons, lit like Home's selected row", () => {
  const home = readFileSync("app/src/style/home.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  /** The declarations of the rule whose selector list has this selector in it. */
  const ruleWith = (selector: string): string => {
    const found = [...home.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, selectors]) =>
      selectors!.split(",").map((s) => s.trim()).includes(selector),
    );
    expect(found, selector).toBeDefined();
    return found![2]!;
  };

  it("carries Home's own arrow on both, and neither is permanently lit", () => {
    const { cancel, create } = dialog();
    for (const button of [cancel, create]) {
      expect(button.querySelector(".gesture__cursor")!.textContent).toBe(">");
      expect(button.classList.contains("dialog-action")).toBe(true);
      expect(button.classList.contains("new-project-dialog__action--confirm")).toBe(false);
    }
    const rest = ruleWith(".new-project-dialog__action");
    expect(rest).toContain("background: transparent");
    expect(rest).toContain("color: var(--colour-muted)");
  });

  it("keeps every dialog button's words clear of its arrow, and lets a long label grow", () => {
    const rest = ruleWith(".new-project-dialog__action");
    expect(rest).toContain("padding: 0 var(--space-dialog-arrow)");
    expect(rest).toContain("min-width: var(--measure-dialog-slot)");
    expect(rest).toContain("width: max-content");
    // The room is the arrow's own offset, its width, and the same gap again.
    expect(ruleWith(".dialog-action .gesture__cursor")).toContain("left: var(--space-tight)");
    expect(readFileSync("app/src/style/tokens.css", "utf8")).toContain(
      "--space-dialog-arrow: calc(var(--space-tight) * 2 + 1ch);",
    );
  });

  it("lights hover and focus with the very rule that lights Home's selected row", () => {
    const lit = ruleWith(".menu--home .gesture--selected");
    expect(lit).toContain("background: var(--colour-overlay)");
    expect(lit).toContain("color: var(--colour-accent)");
    expect(ruleWith(".dialog-action:hover:not(:disabled)")).toBe(lit);
    expect(ruleWith(".dialog-action:focus:not(:disabled)")).toBe(lit);
    const arrow = ruleWith(".menu--home .gesture--selected .gesture__cursor");
    expect(arrow).toContain("visibility: visible");
    expect(ruleWith(".dialog-action:hover:not(:disabled) .gesture__cursor")).toBe(arrow);
    expect(ruleWith(".dialog-action:focus:not(:disabled) .gesture__cursor")).toBe(arrow);
    expect(ruleWith(".dialog-action:focus")).toContain("outline: none");
  });

  it("moves focus to a hovered button only from another button, never from the title", () => {
    const { title, cancel, create, type_ } = dialog();
    type_("Big Fish");
    create.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.activeElement).toBe(title);
    cancel.focus();
    create.dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.activeElement).toBe(create);
  });

  it("has no permanently lit Confirm left, now every simple dialog is moved over", () => {
    expect(home).not.toContain("new-project-dialog__action--confirm");
    expect(home).not.toContain("new-project-dialog__cursor");
  });
});

describe("walking the New Project dialog from the keyboard", () => {
  const named = () => {
    const shown = dialog();
    shown.type_("Big Fish");
    return shown;
  };

  it("opens in the title, being edited", () => {
    const { title } = dialog();
    expect(document.activeElement).toBe(title);
    expect(title.classList.contains("dialog-keys__editing")).toBe(true);
  });

  it("wraps Tab and Shift+Tab through every control", () => {
    const { type, title, cancel, create, press } = named();
    const seen = [1, 2, 3, 4].map(() => (press("Tab"), document.activeElement));
    expect(seen).toEqual([cancel, create, type, title]);
    const back = [1, 2, 3, 4].map(() => (press("Tab", { shiftKey: true }), document.activeElement));
    expect(back).toEqual([type, create, cancel, title]);
  });

  it("skips a disabled Confirm with Tab and with the arrows", () => {
    const { type, cancel, create, press } = dialog();
    press("Tab");
    expect(document.activeElement).toBe(cancel);
    press("ArrowRight");
    expect(document.activeElement).toBe(cancel);
    press("Tab");
    expect(document.activeElement).toBe(type);
    expect(create.disabled).toBe(true);
  });

  it("moves between rows and along the buttons with the arrows, once out of the field", () => {
    const { type, title, cancel, create, press } = named();
    press("Escape");
    press("ArrowDown");
    expect(document.activeElement).toBe(cancel);
    press("ArrowRight");
    expect(document.activeElement).toBe(create);
    press("ArrowLeft");
    expect(document.activeElement).toBe(cancel);
    press("ArrowDown");
    expect(document.activeElement).toBe(type);
    press("ArrowDown");
    expect(document.activeElement).toBe(title);
    press("ArrowUp");
    expect(document.activeElement).toBe(type);
    press("ArrowUp");
    expect(document.activeElement).toBe(cancel);
  });

  it("leaves the arrows to the caret while the title is being edited", () => {
    const { title, press } = named();
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(press(key).defaultPrevented, key).toBe(false);
      expect(document.activeElement).toBe(title);
    }
  });

  it("starts editing on Enter, on typing and on a click, and Tab ends it", () => {
    const { title, press } = named();
    const editing = () => title.classList.contains("dialog-keys__editing");
    press("Tab");
    expect(editing()).toBe(false);
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(title);
    expect(editing()).toBe(false);
    press("Enter");
    expect(editing()).toBe(true);
    press("Escape");
    title.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editing()).toBe(true);
    press("Escape");
    title.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editing()).toBe(true);
  });

  it("does not confirm on the Enter that starts editing", () => {
    const { press, onCreate } = named();
    press("Escape");
    press("Enter");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("uses Escape to end editing first, and only then lets it cancel", () => {
    const { modal, title, press } = dialog();
    const first = press("Escape");
    expect(first.defaultPrevented).toBe(true);
    expect(title.classList.contains("dialog-keys__editing")).toBe(false);
    // Even a webview that fires `cancel` anyway does not close the dialog.
    const stray = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(true);
    expect(press("Escape").defaultPrevented).toBe(false);
    const cancel = new Event("cancel", { cancelable: true });
    modal.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(false);
  });

  it("confirms from the title being edited, and only with a name", async () => {
    const { press, type_, onCreate, onClose } = dialog();
    press("Enter");
    expect(onCreate).not.toHaveBeenCalled();
    type_("Big Fish");
    press("Enter");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
  });

  it("activates the focused button on Enter", async () => {
    const first = named();
    first.create.focus();
    first.press("Enter");
    await vi.waitFor(() => expect(first.onCreate).toHaveBeenCalledTimes(1));
    const second = named();
    second.cancel.focus();
    second.press("Enter");
    expect(second.onClose).toHaveBeenCalled();
    expect(second.onCreate).not.toHaveBeenCalled();
  });
});

describe("the project type drop-down", () => {
  const opened = () => {
    const shown = dialog();
    shown.type.focus();
    shown.press("Enter");
    return shown;
  };
  const isOpen = ({ type, tray }: { type: HTMLElement; tray: HTMLElement }) => {
    expect(type.getAttribute("aria-expanded")).toBe(String(!tray.hidden));
    return !tray.hidden;
  };

  it("is a combobox over a listbox, in the right-click menu's look", () => {
    const { type, tray, list } = dialog();
    expect(type.getAttribute("role")).toBe("combobox");
    expect(type.getAttribute("aria-haspopup")).toBe("listbox");
    expect(type.getAttribute("aria-controls")).toBe(list.id);
    expect(tray.classList.contains("drop-menu--context")).toBe(true);
    const option = list.querySelector("[role=option]")!;
    expect(option.classList.contains("drop-menu__item")).toBe(true);
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(type.hasAttribute("title")).toBe(false);
  });

  it.each(["Enter", " "])("opens on %j, and the arrows pass over it while it is closed", (key) => {
    const shown = dialog();
    shown.type.focus();
    shown.press("ArrowDown");
    expect(document.activeElement).toBe(shown.title);
    shown.type.focus();
    shown.press(key);
    expect(isOpen(shown)).toBe(true);
    expect(shown.type.getAttribute("aria-activedescendant")).toBe(shown.list.firstElementChild!.id);
  });

  it("names the highlighted row every time it opens, and no row while closed", () => {
    const shown = opened();
    shown.press("Escape");
    expect(shown.type.hasAttribute("aria-activedescendant")).toBe(false);
    shown.press("Enter");
    expect(shown.type.getAttribute("aria-activedescendant")).toBe(shown.list.firstElementChild!.id);
  });

  it("keeps the arrows in the list while open", () => {
    const shown = opened();
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) {
      expect(shown.press(key).defaultPrevented, key).toBe(true);
      expect(document.activeElement).toBe(shown.type);
    }
    expect(isOpen(shown)).toBe(true);
  });

  it("closes on Escape, keeping focus and keeping the dialog", () => {
    const shown = opened();
    expect(shown.press("Escape").defaultPrevented).toBe(true);
    expect(isOpen(shown)).toBe(false);
    expect(document.activeElement).toBe(shown.type);
    const stray = new Event("cancel", { cancelable: true });
    shown.modal.dispatchEvent(stray);
    expect(stray.defaultPrevented).toBe(true);
    expect(shown.press("Escape").defaultPrevented).toBe(false);
  });

  it("picks on Enter without confirming, and Feature is what gets made", async () => {
    const shown = opened();
    shown.type_("Big Fish");
    shown.press("Enter");
    expect(isOpen(shown)).toBe(false);
    expect(shown.onCreate).not.toHaveBeenCalled();
    shown.submit();
    await vi.waitFor(() => expect(shown.onClose).toHaveBeenCalled());
    expect(shown.onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
  });

  it("opens and picks with the mouse", () => {
    const shown = dialog();
    shown.type.click();
    expect(isOpen(shown)).toBe(true);
    (shown.list.firstElementChild as HTMLElement).click();
    expect(isOpen(shown)).toBe(false);
    expect(shown.type.textContent).toBe("Feature");
  });

  const row = ({ list }: { list: HTMLElement }, index: number) => list.children[index] as HTMLElement;
  const highlighted = ({ type }: { type: HTMLElement }) =>
    document.getElementById(type.getAttribute("aria-activedescendant")!)!.firstElementChild!.textContent;

  it("makes the type picked with the keys", async () => {
    const shown = opened();
    shown.type_("Big Fish");
    shown.press("ArrowDown");
    shown.press("Enter");
    expect(shown.type.textContent).toBe("Episode");
    shown.submit();
    await vi.waitFor(() => expect(shown.onClose).toHaveBeenCalled());
    expect(shown.onCreate).toHaveBeenCalledWith({ type: "Episode", title: "Big Fish" });
  });

  it("makes the type picked with the mouse", async () => {
    const shown = dialog();
    shown.type_("Big Fish");
    shown.type.click();
    row(shown, 2).click();
    expect(shown.type.textContent).toBe("Short Film");
    shown.submit();
    await vi.waitFor(() => expect(shown.onClose).toHaveBeenCalled());
    expect(shown.onCreate).toHaveBeenCalledWith({ type: "Short Film", title: "Big Fish" });
  });

  it("dims and tags only the types that are coming", () => {
    const shown = dialog();
    const rows = [...shown.list.children];
    const coming = rows.slice(3);
    expect(coming).toHaveLength(5);
    for (const option of coming) {
      expect(option.classList.contains("dialog-select__option--unavailable")).toBe(true);
      expect(option.getAttribute("aria-disabled")).toBe("true");
      expect(option.querySelector(".drop-menu__hint")!.textContent).toBe("soon");
      expect(option.hasAttribute("title")).toBe(false);
    }
    for (const option of rows.slice(0, 3)) {
      expect(option.classList.contains("dialog-select__option--unavailable")).toBe(false);
      expect(option.hasAttribute("aria-disabled")).toBe(false);
      expect(option.querySelector(".drop-menu__hint")).toBeNull();
    }
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).toMatch(/\.dialog-select__option--unavailable:hover[^{]*\{\s*color: var\(--colour-faint\)/);
  });

  const ALL_TYPES = ["Feature", "Episode", "Short Film", "Novel", "Short Story", "Novella", "Flash Fiction", "Poem"];
  const point = (option: HTMLElement) =>
    option.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 1 } as MouseEventInit));

  it("walks the arrows through the whole list, coming types too, and wraps", () => {
    const shown = opened();
    const down = ALL_TYPES.map(() => (shown.press("ArrowDown"), highlighted(shown)));
    expect(down).toEqual([...ALL_TYPES.slice(1), "Feature"]);
    const up = ALL_TYPES.map(() => (shown.press("ArrowUp"), highlighted(shown)));
    expect(up).toEqual([...ALL_TYPES].reverse());
  });

  it("lets the pointer light a coming type, which stays dimmed and tagged", () => {
    const shown = opened();
    const novel = row(shown, 3);
    point(novel);
    expect(highlighted(shown)).toBe("Novel");
    expect(novel.classList.contains("dialog-select__option--active")).toBe(true);
    expect(novel.classList.contains("dialog-select__option--unavailable")).toBe(true);
    expect(novel.querySelector(".drop-menu__hint")!.textContent).toBe("soon");
    expect(novel.getAttribute("aria-selected")).toBe("false");
    expect(row(shown, 0).classList.contains("dialog-select__option--active")).toBe(false);
  });

  it("draws the highlight on a coming type without the gold of a usable one", () => {
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).toMatch(/\.dialog-select__option--unavailable\.dialog-select__option--active\s*\{\s*color: var\(--colour-muted\)/);
  });

  it("draws no `>` on any row of the tray, lit or not, and keeps the bar and the gold", () => {
    const shown = opened();
    const coming = row(shown, 3);
    point(coming);
    expect(shown.list.querySelector(".gesture__cursor")).toBeNull();
    const css = readFileSync("app/src/style/home.css", "utf8");
    expect(css).not.toMatch(/\.dialog-select__[^{}]*\.gesture__cursor/);
    expect(css).toMatch(/\.dialog-select__tray \.dialog-select__option--active\s*\{\s*background: var\(--colour-overlay\);\s*color: var\(--colour-accent\)/);
  });

  it("does nothing when a coming type is clicked, and stays open", () => {
    const shown = opened();
    const novel = row(shown, 3);
    point(novel);
    novel.click();
    expect(isOpen(shown)).toBe(true);
    expect(shown.type.textContent).toBe("Feature");
    expect(novel.getAttribute("aria-selected")).toBe("false");
    expect(highlighted(shown)).toBe("Novel");
  });

  it.each(["Enter", " "])("does nothing on %j on a coming type, and stays open", async (key) => {
    const shown = opened();
    shown.type_("Big Fish");
    for (let i = 0; i < 3; i++) shown.press("ArrowDown");
    expect(highlighted(shown)).toBe("Novel");
    expect(shown.press(key).defaultPrevented).toBe(true);
    expect(isOpen(shown)).toBe(true);
    expect(shown.type.textContent).toBe("Feature");
    expect(shown.onCreate).not.toHaveBeenCalled();
    shown.press("Escape");
    shown.submit();
    await vi.waitFor(() => expect(shown.onClose).toHaveBeenCalled());
    expect(shown.onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
  });

  it("opens on the chosen type again after resting on a coming one", () => {
    const shown = opened();
    shown.press("ArrowUp");
    expect(highlighted(shown)).toBe("Poem");
    shown.press("Escape");
    shown.press("Enter");
    expect(highlighted(shown)).toBe("Feature");
    expect(row(shown, 7).classList.contains("dialog-select__option--active")).toBe(false);
  });

  describe("scrolling", () => {
    // jsdom has no layout: rows 24px tall and 32px apart, five showing, as the tokens draw them.
    const ROW = 24;
    const STEP = 32;
    const TOP = 100;
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height }) as DOMRect;
    const laidOut = () => {
      const shown = dialog();
      const { list } = shown;
      const height = 5 * ROW + 4 * (STEP - ROW);
      list.getBoundingClientRect = () => rect(TOP, height);
      Object.defineProperty(list, "clientHeight", { get: () => height, configurable: true });
      Object.defineProperty(list, "scrollHeight", { get: () => height + END, configurable: true });
      [...list.children].forEach((option, index) => {
        option.getBoundingClientRect = () => rect(TOP + index * STEP - list.scrollTop, ROW);
      });
      const scrollTo = (to: number) => {
        list.scrollTop = to;
        list.dispatchEvent(new Event("scroll", { bubbles: true }));
      };
      const showing = () => ({
        above: !shown.tray.querySelector<HTMLElement>(".projects-hint--above")!.hidden,
        below: !shown.tray.querySelector<HTMLElement>(".projects-hint--below")!.hidden,
      });
      return { ...shown, scrollTo, showing };
    };
    const END = 3 * STEP;

    it("shows five rows, measured from the row and gap tokens, with no scrollbar", () => {
      const css = readFileSync("app/src/style/home.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const tokens = readFileSync("app/src/style/tokens.css", "utf8");
      expect(tokens).toMatch(/--count-dialog-rows:\s*5;/);
      const rule = css.match(/\.dialog-select__list\s*\{([^}]*)\}/)![1]!;
      expect(rule).toContain("max-height: calc(var(--count-dialog-rows) * var(--size-row) + (var(--count-dialog-rows) - 1) * var(--space-row-gap));");
      expect(rule).toMatch(/gap:\s*var\(--space-row-gap\)/);
      expect(rule).toMatch(/overflow-y:\s*auto/);
      expect(rule).toMatch(/scrollbar-width:\s*none/);
      expect(css).toMatch(/\.dialog-select__list::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
    });

    it("leaves the chevrons room of their own, so they cover no row", () => {
      const { tray, list } = dialog();
      const frame = list.parentElement!;
      expect(frame.parentElement).toBe(tray);
      expect([...frame.children].map((child) => child.className)).toEqual([
        "projects-hint projects-hint--above",
        "dialog-select__list",
        "projects-hint projects-hint--below",
      ]);
      for (const hint of frame.querySelectorAll(".projects-hint")) expect(hint.getAttribute("aria-hidden")).toBe("true");
      const css = readFileSync("app/src/style/home.css", "utf8");
      expect(css).toMatch(/\.drop-menu\.dialog-select__tray\s*\{[^}]*padding-block:\s*calc\(var\(--size-icon\) \+ var\(--distance-hint-bounce\) \+ var\(--space-hint-clear\) \* 2\)/);
      expect(css).toMatch(/\.dialog-select__window \.projects-hint--above\s*\{\s*bottom:\s*calc\(100% \+ var\(--space-hint-clear\)\)/);
      expect(css).toMatch(/\.dialog-select__window \.projects-hint--below\s*\{\s*top:\s*calc\(100% \+ var\(--space-hint-clear\)\)/);
      expect(css).toMatch(/\.dialog-select__window\s*\{[^}]*position:\s*relative/);
    });

    it("shows each chevron only while there is more that way", () => {
      const shown = laidOut();
      shown.type.click();
      expect(shown.showing()).toEqual({ above: false, below: true });
      shown.scrollTo(STEP);
      expect(shown.showing()).toEqual({ above: true, below: true });
      shown.scrollTo(END);
      expect(shown.showing()).toEqual({ above: true, below: false });
      shown.scrollTo(0);
      expect(shown.showing()).toEqual({ above: false, below: true });
    });

    it("hides the down chevron at the end of the list, though the last row's box sits past the edge", () => {
      const shown = laidOut();
      shown.type.click();
      const last = row(shown, 7);
      last.getBoundingClientRect = () => rect(TOP + 7 * STEP - shown.list.scrollTop + 1.5, ROW);
      shown.scrollTo(END - 0.5);
      expect(shown.showing()).toEqual({ above: true, below: false });
    });

    it("shows neither chevron when every row fits", () => {
      const shown = laidOut();
      shown.list.getBoundingClientRect = () => rect(TOP, 8 * STEP);
      shown.type.click();
      expect(shown.showing()).toEqual({ above: false, below: false });
    });

    it.each(["keys", "pointer"])("brings the row the %s land on into view, and updates the chevrons", (by) => {
      const shown = laidOut();
      shown.type.click();
      const poem = row(shown, 7);
      // Moves the list as the browser would, and fires no scroll event of its own.
      poem.scrollIntoView = vi.fn(() => {
        shown.list.scrollTop = END;
      });
      if (by === "keys") shown.press("ArrowUp");
      else point(poem);
      expect(poem.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      expect(shown.showing()).toEqual({ above: true, below: false });
    });

    it("stays open while its own list scrolls, and closes if anything else does", () => {
      const shown = laidOut();
      shown.type.click();
      shown.scrollTo(STEP);
      expect(isOpen(shown)).toBe(true);
      shown.modal.dispatchEvent(new Event("scroll"));
      expect(isOpen(shown)).toBe(false);
    });

    it("keeps focus on the field through a press on the tray's edge", () => {
      const shown = laidOut();
      shown.type.click();
      const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      shown.tray.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    });
  });

  it.each(["Enter", " "])("picks an available type on %j even after a coming one is clicked", (key) => {
    const shown = opened();
    row(shown, 7).click();
    shown.press(key);
    expect(isOpen(shown)).toBe(false);
    expect(shown.type.textContent).toBe("Feature");
  });

  it("cannot confirm a coming type", async () => {
    const shown = dialog();
    shown.type_("Big Fish");
    shown.type.click();
    for (const index of [3, 4, 5, 6, 7]) row(shown, index).click();
    shown.press("Escape");
    shown.submit();
    await vi.waitFor(() => expect(shown.onClose).toHaveBeenCalled());
    expect(shown.onCreate).toHaveBeenCalledTimes(1);
    expect(shown.onCreate).toHaveBeenCalledWith({ type: "Feature", title: "Big Fish" });
  });

  it("begins on the first available choice, whatever comes before it", () => {
    const { control, tray, value } = dialogSelect({
      id: "pick",
      label: "Pick",
      choices: [
        { value: "later", label: "Later", unavailable: "soon" },
        { value: "now", label: "Now" },
      ],
    });
    document.body.append(control, tray);
    expect(value()).toBe("now");
    expect(control.textContent).toBe("Now");
    control.click();
    expect(control.getAttribute("aria-activedescendant")).toBe("pick-option-1");
  });

  it("closes on Tab and moves on", () => {
    const shown = opened();
    shown.press("Tab");
    expect(isOpen(shown)).toBe(false);
    expect(document.activeElement).toBe(shown.title);
  });

  it("hangs below the field, or above it when there is no room, inside the window", () => {
    const field = { top: 100, bottom: 136 };
    expect(placeTray(field, 40, 6, 600)).toBe(136);
    expect(placeTray({ top: 500, bottom: 536 }, 100, 6, 600)).toBe(388);
    expect(placeTray({ top: 20, bottom: 56 }, 580, 6, 600)).toBe(8);
  });
});

describe("the dialogs that share the old New Project styles", () => {
  const css = (name: string) => readFileSync(join(import.meta.dirname, "..", "..", "app", "src", "style", name), "utf8");

  it("still have the classes the New Project redesign left alone", () => {
    const app = css("app.css");
    for (const selector of [".report", ".report__heading", ".report__actions", ".new-project__form", ".field", ".field__label", ".field__input", ".new-project__actions"]) {
      expect(app).toContain(`${selector} {`);
    }
    expect(app).toContain(".report::backdrop");
  });

  it("are not styled by the redesign's stylesheet", () => {
    const home = css("home.css");
    for (const old of [".report", ".new-project__form", ".field", ".new-project__actions", ".button"]) {
      expect(home).not.toMatch(new RegExp(`^${old.replace(".", "\\.")}[\\s,{:]`, "m"));
    }
  });
});
