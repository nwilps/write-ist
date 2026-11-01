/**
 * The drop-down menu (the desk design, §2.4): one component for File, Edit and
 * View, and the File menu the Editor builds from it.
 *
 * What is checked is what the writer does with it — open it, move through it
 * with the keyboard alone, choose, and get out — and that Escape never reaches
 * the window, which answers it by closing the project.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dropMenu, type DropMenu, type MenuEntry } from "../../app/src/menus/drop-menu.ts";
import { sidePanels } from "../../app/src/workspaces/editor/panels.ts";
import { asksForMenu } from "../../app/src/screens/shortcuts.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "");
const menusCss = strip(readFileSync(join(style, "menus.css"), "utf8"));
const panelsCss = strip(readFileSync(join(style, "panels.css"), "utf8"));
const tokens = readFileSync(join(style, "tokens.css"), "utf8");

const live: DropMenu[] = [];
afterEach(() => {
  live.splice(0).forEach((menu) => menu.dispose());
  document.body.replaceChildren();
});

function build(items: readonly MenuEntry[], access = "f") {
  const trigger = document.createElement("button");
  trigger.textContent = "File";
  const menu = dropMenu(trigger, { label: "File", access, items });
  live.push(menu);
  document.body.append(menu.anchor);
  const list = menu.anchor.querySelector<HTMLElement>('[role="menu"]')!;
  const items$ = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  return { menu, trigger, list, items$ };
}

const key = (target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe("a drop-down menu", () => {
  it("is closed until asked, and says so to assistive technology", () => {
    const { trigger, list } = build([{ label: "One", act: () => {} }]);
    expect(list.hidden).toBe(true);
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(list.getAttribute("aria-label")).toBe("File");
  });

  it("opens on a click, puts focus on the first item, and closes on a second click", () => {
    const { trigger, list, items$ } = build([
      { label: "One", act: () => {} },
      { label: "Two", act: () => {} },
    ]);
    trigger.click();
    expect(list.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items$()[0]);
    trigger.click();
    expect(list.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("draws labels, hints, icons and a divider as roles a screen reader knows", () => {
    const { list } = build([
      { label: "Save Project", hint: "[Ctrl + S]", icon: [["path", { d: "M0 0" }]], act: () => {} },
      { divider: true },
      { label: "Home", act: () => {} },
    ]);
    const first = list.querySelector('[role="menuitem"]')!;
    expect(first.textContent).toBe("Save Project[Ctrl + S]");
    expect(first.querySelector(".drop-menu__hint")?.textContent).toBe("[Ctrl + S]");
    expect(first.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(list.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(list.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
  });

  it("moves with the arrows, wraps, and jumps with Home and End", () => {
    const { trigger, items$ } = build([
      { label: "One", act: () => {} },
      { label: "Two", act: () => {} },
      { label: "Three", act: () => {} },
    ]);
    trigger.click();
    const [one, two, three] = items$();
    key(one!, "ArrowDown");
    expect(document.activeElement).toBe(two);
    key(two!, "ArrowDown");
    key(three!, "ArrowDown");
    expect(document.activeElement).toBe(one);
    key(one!, "ArrowUp");
    expect(document.activeElement).toBe(three);
    key(three!, "Home");
    expect(document.activeElement).toBe(one);
    key(one!, "End");
    expect(document.activeElement).toBe(three);
  });

  it("opens from the row's arrow keys, onto the first or last item", () => {
    const { trigger, items$ } = build([
      { label: "One", act: () => {} },
      { label: "Two", act: () => {} },
    ]);
    key(trigger, "ArrowUp");
    expect(document.activeElement).toBe(items$()[1]);
  });

  it("skips an unavailable item", () => {
    const { trigger, items$ } = build([
      { label: "One", act: () => {} },
      { label: "Two", act: () => {}, unavailable: true },
      { label: "Three", act: () => {} },
    ]);
    trigger.click();
    key(items$()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(items$()[2]);
  });

  it("chooses with a click or Enter's click, closes, and does the item's act once", () => {
    const act = vi.fn();
    const { trigger, list, items$ } = build([{ label: "One", act }]);
    trigger.click();
    items$()[0]!.click();
    expect(act).toHaveBeenCalledTimes(1);
    expect(list.hidden).toBe(true);
  });

  it("does nothing for an unavailable item", () => {
    const act = vi.fn();
    const { trigger, items$ } = build([{ label: "One", act, unavailable: true }]);
    trigger.click();
    items$()[0]!.click();
    expect(act).not.toHaveBeenCalled();
  });

  it("lets the item's act have the last word on focus", () => {
    const elsewhere = document.createElement("textarea");
    document.body.append(elsewhere);
    const { trigger, items$ } = build([{ label: "One", act: () => elsewhere.focus() }]);
    trigger.click();
    items$()[0]!.click();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("closes on Escape and stops there: the window would close the project", () => {
    const reachedWindow = vi.fn();
    window.addEventListener("keydown", reachedWindow);
    const { trigger, list, items$ } = build([{ label: "One", act: () => {} }]);
    trigger.click();
    const event = key(items$()[0]!, "Escape");
    window.removeEventListener("keydown", reachedWindow);
    expect(list.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedWindow).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab and lets the Tab go on", () => {
    const { trigger, list, items$ } = build([{ label: "One", act: () => {} }]);
    trigger.click();
    const event = key(items$()[0]!, "Tab");
    expect(list.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("closes on a click outside, and not on a click inside", () => {
    const { trigger, list } = build([{ label: "One", act: () => {} }]);
    trigger.click();
    list.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(list.hidden).toBe(false);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(list.hidden).toBe(true);
  });

  it("opens from anywhere on Alt plus its letter, and closes on it again", () => {
    const { list } = build([{ label: "One", act: () => {} }], "f");
    const opening = key(window, "f", { altKey: true });
    expect(opening.defaultPrevented).toBe(true);
    expect(list.hidden).toBe(false);
    key(window, "f", { altKey: true });
    expect(list.hidden).toBe(true);
    // Not without Alt, nor with Ctrl.
    key(window, "f");
    key(window, "f", { altKey: true, ctrlKey: true });
    expect(list.hidden).toBe(true);
  });

  it("has one menu open at a time", () => {
    const file = build([{ label: "One", act: () => {} }], "f");
    const edit = build([{ label: "Cut", act: () => {} }], "e");
    file.menu.open();
    edit.menu.open();
    expect(file.menu.isOpen()).toBe(false);
    expect(edit.menu.isOpen()).toBe(true);
  });

  it("stops answering its access key once disposed", () => {
    const { menu, list } = build([{ label: "One", act: () => {} }]);
    menu.dispose();
    key(window, "f", { altKey: true });
    expect(list.hidden).toBe(true);
  });
});

describe("asksForMenu", () => {
  const press = { key: "F", altKey: true, ctrlKey: false, metaKey: false };
  it("wants Alt and the letter, in either case, and nothing else held", () => {
    expect(asksForMenu(press, "f")).toBe(true);
    expect(asksForMenu({ ...press, key: "e" }, "f")).toBe(false);
    expect(asksForMenu({ ...press, altKey: false }, "f")).toBe(false);
    expect(asksForMenu({ ...press, ctrlKey: true }, "f")).toBe(false);
    expect(asksForMenu({ ...press, metaKey: true }, "f")).toBe(false);
  });
});

describe("the File menu in the Editor's panel", () => {
  const act = { save: vi.fn(), projects: vi.fn(), home: vi.fn() };
  function filePanel() {
    const panels = sidePanels(undefined, {
      File: [
        { label: "Save Project", hint: "[Ctrl + S]", act: act.save },
        { label: "Open Project", hint: "[Esc]", act: act.projects },
        { divider: true },
        { label: "Home", act: act.home },
      ],
    });
    document.body.append(panels.left);
    live.push({ dispose: panels.dispose } as DropMenu);
    return panels;
  }

  it("opens from the File row, and Edit and View stay plain rows with no menu", () => {
    const panels = filePanel();
    const rows = [...panels.left.querySelectorAll<HTMLButtonElement>(".panel__row")];
    expect(rows.map((row) => row.textContent)).toEqual(["File[Alt + F]", "Edit[Alt + E]", "View[Alt + V]"]);
    expect(panels.left.querySelectorAll('[role="menu"]')).toHaveLength(1);
    expect(rows[1]!.getAttribute("aria-haspopup")).toBeNull();
    rows[0]!.click();
    const items = [...panels.left.querySelectorAll('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual([
      "Save Project[Ctrl + S]",
      "Open Project[Esc]",
      "Home",
    ]);
  });

  it("reaches each action from the keyboard alone", () => {
    const panels = filePanel();
    key(window, "f", { altKey: true });
    const items = [...panels.left.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(document.activeElement).toBe(items[0]);
    items[0]!.click();
    expect(act.save).toHaveBeenCalledTimes(1);

    key(window, "f", { altKey: true });
    key(items[0]!, "ArrowDown");
    items[1]!.click();
    expect(act.projects).toHaveBeenCalledTimes(1);

    key(window, "f", { altKey: true });
    key(items[0]!, "End");
    items[2]!.click();
    expect(act.home).toHaveBeenCalledTimes(1);
  });
});

describe("the menu's look", () => {
  it("is the design's: 280px, raised, outlined in the desk's colour, a floating corner", () => {
    expect(tokens).toContain("--size-menu: 280px");
    expect(tokens).toContain("--rule-menu: 2px");
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*width: var\(--size-menu\)/);
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*background: var\(--colour-raised\)/);
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*border: var\(--rule-menu\) solid var\(--colour-base\)/);
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*border-radius: var\(--radius-float\)/);
  });

  it("is 12px from the column and from its own edge, off the one panel-gap token", () => {
    expect(tokens).toMatch(/--space-panel: 12px/);
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*left: calc\(100% \+ var\(--space-panel-x\) \+ var\(--space-panel-gap\)\)/);
    expect(menusCss).toMatch(/\.drop-menu \{[^}]*padding: var\(--space-panel\)/);
  });

  it("lights the focused row with the overlay and the accent, and has a hairline divider", () => {
    expect(menusCss).toMatch(/\.drop-menu__item:focus[^{]*\{[^}]*background: var\(--colour-overlay\)[^}]*color: var\(--colour-accent\)/);
    expect(menusCss).toMatch(/\.drop-menu__divider \{[^}]*background: var\(--colour-border\)/);
    expect(menusCss).toMatch(/\.drop-menu__hint \{[^}]*color: var\(--colour-faint\)/);
  });

  it("keeps the hidden attribute stronger than the list's display, and sits over the paper", () => {
    expect(menusCss).toMatch(/\.drop-menu\[hidden\] \{[^}]*display: none/);
    expect(panelsCss).toMatch(/\.desk__column--left \{[^}]*z-index: var\(--layer-menu\)/);
  });
});
