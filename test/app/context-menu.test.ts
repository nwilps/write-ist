/**
 * The paper's right-click menu (ADR-0034): the component that opens it where
 * the writer pointed, and the list of items it holds, which is read from the
 * command table.
 *
 * What is checked is what the writer meets — where it opens, that it stays in
 * the window, what closes it, that the keyboard walks it — and that the items
 * are the table's: the labels and hints the menubar draws, greyed where the
 * command would do nothing, and nothing the key does not reach.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { openContextMenu, placeMenu, type ContextMenu } from "../../app/src/menus/context-menu.ts";
import { dropMenu, type MenuEntry, type MenuItem } from "../../app/src/menus/drop-menu.ts";
import { COMMANDS, type Command, type CommandHost, type Misspelling } from "../../app/src/workspaces/editor/commands.ts";
import { contextMenuItems, MAX_SUGGESTIONS } from "../../app/src/workspaces/editor/context-menu-items.ts";
import { pasteInto } from "../../src/screenplay/clipboard.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const live: ContextMenu[] = [];
afterEach(() => {
  live.splice(0).forEach((menu) => menu.close(false));
  document.body.replaceChildren();
});

const items = (labels: string[]): MenuEntry[] => labels.map((label) => ({ label, act: vi.fn() }));

function open(entries: readonly MenuEntry[], at: Partial<Parameters<typeof openContextMenu>[0]> = {}) {
  const restoreFocus = vi.fn();
  const menu = openContextMenu({ label: "Edit", items: entries, x: 40, y: 50, restoreFocus, ...at });
  live.push(menu);
  const list = document.querySelector<HTMLElement>('[role="menu"]')!;
  const choices = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  return { menu, list, choices, restoreFocus };
}

const key = (target: EventTarget, name: string): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("where the menu goes", () => {
  const window = { width: 800, height: 600 };
  const size = { width: 280, height: 200 };

  it("opens with its corner at the pointer", () => {
    expect(placeMenu({ x: 100, y: 120 }, size, window)).toEqual({ left: 100, top: 120 });
  });

  it("flips to the left of the pointer near the right edge, and above it near the bottom", () => {
    expect(placeMenu({ x: 700, y: 120 }, size, window)).toEqual({ left: 420, top: 120 });
    expect(placeMenu({ x: 100, y: 500 }, size, window)).toEqual({ left: 100, top: 300 });
    expect(placeMenu({ x: 700, y: 500 }, size, window)).toEqual({ left: 420, top: 300 });
  });

  it("is held inside the window when neither side has room", () => {
    expect(placeMenu({ x: 100, y: 100 }, { width: 280, height: 900 }, window)).toEqual({ left: 100, top: 0 });
    expect(placeMenu({ x: 100, y: 100 }, { width: 900, height: 200 }, window)).toEqual({ left: 0, top: 100 });
  });
});

describe("the context menu", () => {
  it("is drawn with the classes File, Edit and View use, so it looks like them", () => {
    const { list, choices } = open(items(["One", "Two"]));
    expect(list.classList.contains("drop-menu")).toBe(true);
    expect(choices().every((choice) => choice.classList.contains("drop-menu__item"))).toBe(true);

    const trigger = document.createElement("button");
    const drop = dropMenu(trigger, { label: "File", access: "f", items: items(["One"]) });
    const dropClasses = drop.anchor.querySelector(".drop-menu")!.className;
    drop.dispose();
    expect(dropClasses).toBe("drop-menu");
    expect(list.className).toBe("drop-menu drop-menu--context");
  });

  it("is told to the screen reader as a menu, with its items", () => {
    const { list, choices } = open(items(["One", "Two"]));
    expect(list.getAttribute("aria-label")).toBe("Edit");
    expect(choices().map((choice) => choice.textContent)).toEqual(["One", "Two"]);
  });

  it("opens at the pointer: the stylesheet is handed the measured point", () => {
    const { list } = open(items(["One"]), { x: 40, y: 50 });
    expect(list.style.getPropertyValue("--menu-x")).toBe("40");
    expect(list.style.getPropertyValue("--menu-y")).toBe("50");
    const css = readFileSync(join(root, "app/src/style/menus.css"), "utf8");
    expect(css).toMatch(/\.drop-menu--context\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.drop-menu--context\s*\{[^}]*var\(--menu-x/);
  });

  it("closes on Escape, hands focus back, and keeps the window from hearing it", () => {
    const { menu, list, restoreFocus } = open(items(["One"]));
    const heard = vi.fn();
    document.body.addEventListener("keydown", heard);
    const event = key(list, "Escape");
    document.body.removeEventListener("keydown", heard);
    expect(event.defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  it("closes on a press outside, and not on a press inside", () => {
    const { menu, list } = open(items(["One"]));
    list.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.isOpen()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it("closes when anything scrolls, and when the window resizes", () => {
    const scrolled = open(items(["One"]));
    const paper = document.createElement("div");
    document.body.append(paper);
    paper.dispatchEvent(new Event("scroll"));
    expect(scrolled.menu.isOpen()).toBe(false);

    const resized = open(items(["One"]));
    window.dispatchEvent(new Event("resize"));
    expect(resized.menu.isOpen()).toBe(false);
  });

  it("closes on choosing an item, after focus has gone back, and does what the item does", () => {
    const order: string[] = [];
    const act = vi.fn(() => order.push("act"));
    const { menu, choices } = open([{ label: "Copy", act }], { restoreFocus: () => order.push("focus") });
    choices()[0]!.click();
    expect(menu.isOpen()).toBe(false);
    expect(order).toEqual(["focus", "act"]);
  });

  it("does nothing for a greyed item, which the arrow keys skip", () => {
    const act = vi.fn();
    const { menu, list, choices } = open([
      { label: "One", act: vi.fn() },
      { label: "Grey", act, unavailable: true },
      { label: "Three", act: vi.fn() },
    ]);
    choices()[1]!.click();
    expect(act).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
    key(list, "ArrowDown");
    key(choices()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(choices()[2]);
  });

  it("is walked with the arrows from a pointer-opened menu: down starts at the top, up at the bottom", () => {
    const { list, choices } = open(items(["One", "Two", "Three"]));
    expect(document.activeElement).toBe(list);
    key(list, "ArrowDown");
    expect(document.activeElement).toBe(choices()[0]);
    key(choices()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(choices()[1]);
    key(choices()[1]!, "ArrowUp");
    key(choices()[0]!, "ArrowUp");
    expect(document.activeElement).toBe(choices()[2]);
    key(choices()[2]!, "Home");
    expect(document.activeElement).toBe(choices()[0]);
    key(choices()[0]!, "End");
    expect(document.activeElement).toBe(choices()[2]);

    const again = open(items(["One", "Two"]));
    key(again.list, "ArrowUp");
    expect(document.activeElement).toBe(again.choices()[1]);
  });

  it("lights the first item when the keyboard asked for it, and Enter chooses", () => {
    const act = vi.fn();
    const { menu, choices } = open([{ label: "One", act }, { label: "Two", act: vi.fn() }], { fromKeyboard: true });
    expect(document.activeElement).toBe(choices()[0]);
    // A button answers Enter with a click.
    choices()[0]!.click();
    expect(act).toHaveBeenCalledOnce();
    expect(menu.isOpen()).toBe(false);
  });

  it("is the only menu open: opening one closes another, drop-down or context", () => {
    const first = open(items(["One"]));
    const second = open(items(["Two"]));
    expect(first.menu.isOpen()).toBe(false);
    expect(second.menu.isOpen()).toBe(true);

    const trigger = document.createElement("button");
    const drop = dropMenu(trigger, { label: "File", access: "f", items: items(["One"]) });
    document.body.append(drop.anchor);
    drop.open();
    expect(second.menu.isOpen()).toBe(false);
    drop.dispose();
  });
});

/* ------------------------------------------------------------------- items */

const TWO = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK\nYo.\n";
const PAIR = "INT. A - DAY\n\nSTEEL\nHi.\n\nBRICK ^\nYo.\n";
const ACTION = "INT. A - DAY\n\nThey wait.\n";

function editing(text: string, wrong?: Misspelling) {
  let state: EditorState = editorStateFor(parse(text));
  const view = {
    get state() {
      return state;
    },
    dispatch: (tr: Parameters<EditorState["apply"]>[0]) => {
      state = state.apply(tr);
    },
    focus: () => {},
  } as unknown as EditorView;
  const spies = Object.fromEntries(
    ["save", "saveCopy", "exportPdf", "toProjects", "toHome", "editTitlePage", "viewTitlePage", "confirmName",
      "confirmLocation", "confirmHere", "toggleSpellcheck", "search", "cut", "copy", "paste", "selectAll"].map((name) => [name, vi.fn()]),
  );
  const host = { ...spies, spellcheckOn: () => false, misspellingAt: () => wrong, view: () => view } as unknown as CommandHost &
    Record<string, ReturnType<typeof vi.fn>>;
  return { host, view, state: () => state, saved: () => serialise(manuscriptOf(state.doc)) };
}

const selectText = (writing: ReturnType<typeof editing>, element: number): void => {
  const from = startOfElement(writing.state(), element);
  writing.view.dispatch(writing.state().tr.setSelection(TextSelection.create(writing.state().doc, from, from + 2)));
};

const drawn = (entries: readonly MenuEntry[]): string[] =>
  entries.map((entry) => ("divider" in entry ? "---" : `${entry.unavailable === true ? "~" : ""}${entry.label}${entry.hint ?? ""}`));
const itemNamed = (entries: readonly MenuEntry[], label: string): MenuItem => {
  const found = entries.find((entry): entry is MenuItem => !("divider" in entry) && entry.label === label);
  if (found === undefined) throw new Error(label);
  return found;
};

describe("what the menu holds", () => {
  it("is Cut, Copy, Paste and Select All in action text, with the keys that do the same", async () => {
    const writing = editing(ACTION);
    const at = startOfElement(writing.state(), 1);
    expect(drawn(await contextMenuItems(writing.host, at))).toEqual([
      "~Cut[Ctrl + X]",
      "~Copy[Ctrl + C]",
      "Paste[Ctrl + V]",
      "Select All[Ctrl + A]",
    ]);
  });

  it("offers Cut and Copy once something is selected", async () => {
    const writing = editing(ACTION);
    selectText(writing, 1);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    expect(drawn(entries).slice(0, 2)).toEqual(["Cut[Ctrl + X]", "Copy[Ctrl + C]"]);
  });

  it("reaches the host's code for each, the same code the keys reach", async () => {
    const writing = editing(ACTION);
    selectText(writing, 1);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    for (const [label, action] of [["Cut", "cut"], ["Copy", "copy"], ["Paste", "paste"], ["Select All", "selectAll"]] as const) {
      itemNamed(entries, label).act();
      expect(writing.host[action], label).toHaveBeenCalledOnce();
    }
  });

  it("adds Dual Dialogue where two speeches can pair, greyed where they could not do it", async () => {
    const writing = editing(TWO);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 4));
    expect(drawn(entries).slice(4)).toEqual(["---", "Make Dual Dialogue", "~Make Normal Dialogue", "~Swap Speakers"]);
  });

  it("offers Make Normal and Swap on a pair, and not Make Dual", async () => {
    const writing = editing(PAIR);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 4));
    expect(drawn(entries).slice(4)).toEqual(["---", "~Make Dual Dialogue", "Make Normal Dialogue", "Swap Speakers"]);
  });

  it("leaves Dual Dialogue out where no speech is", async () => {
    const writing = editing(ACTION);
    const labels = drawn(await contextMenuItems(writing.host, startOfElement(writing.state(), 1))).join();
    expect(labels).not.toContain("Dual");
    expect(labels).not.toContain("Swap");
  });

  it("acts where the writer pointed, not where the caret is, and as one change to the file", async () => {
    const writing = editing(TWO);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 4));
    itemNamed(entries, "Make Dual Dialogue").act();
    expect(writing.saved()).toBe(PAIR);
  });

  it("has no divider at an edge or twice running", async () => {
    for (const text of [ACTION, TWO, PAIR]) {
      const writing = editing(text);
      const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
      expect(entries[0]).not.toHaveProperty("divider");
      expect(entries.at(-1)).not.toHaveProperty("divider");
      entries.forEach((entry, at) => {
        if ("divider" in entry) expect(entries[at + 1]).not.toHaveProperty("divider");
      });
    }
  });
});

describe("a misspelt word", () => {
  function misspelt(suggestions: () => Promise<readonly string[]>) {
    const replace = vi.fn();
    const addToDictionary = vi.fn();
    return { replace, addToDictionary, wrong: { suggestions, replace, addToDictionary } satisfies Misspelling };
  }
  const first = (entries: readonly MenuEntry[]): string[] => drawn(entries).slice(0, drawn(entries).indexOf("---"));

  it("puts up to five suggestions at the top and Add to Dictionary under them, then the rest", async () => {
    const { wrong } = misspelt(async () => ["one", "two", "three", "four", "five", "six", "seven"]);
    const writing = editing(ACTION, wrong);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    expect(MAX_SUGGESTIONS).toBe(5);
    expect(first(entries)).toEqual(["one", "two", "three", "four", "five", "Add to Dictionary"]);
    expect(drawn(entries)).toContain("Select All[Ctrl + A]");
  });

  it("replaces the word with the suggestion chosen", async () => {
    const { wrong, replace } = misspelt(async () => ["their", "there"]);
    const writing = editing(ACTION, wrong);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    itemNamed(entries, "there").act();
    expect(replace).toHaveBeenCalledExactlyOnceWith("there");
  });

  it("adds the word to the dictionary", async () => {
    const { wrong, addToDictionary } = misspelt(async () => []);
    const writing = editing(ACTION, wrong);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    itemNamed(entries, "Add to Dictionary").act();
    expect(addToDictionary).toHaveBeenCalledOnce();
  });

  it("says so when the dictionary has nothing, and still offers to add the word", async () => {
    const { wrong } = misspelt(async () => []);
    const writing = editing(ACTION, wrong);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    expect(first(entries)).toEqual(["~No Suggestions", "Add to Dictionary"]);
  });

  it("still opens, with the rest, when the dictionary cannot answer", async () => {
    const { wrong } = misspelt(async () => {
      throw new Error("no engine");
    });
    const writing = editing(ACTION, wrong);
    const entries = await contextMenuItems(writing.host, startOfElement(writing.state(), 1));
    expect(first(entries)).toEqual(["~No Suggestions", "Add to Dictionary"]);
    expect(drawn(entries)).toContain("Paste[Ctrl + V]");
  });

  it("is not offered where nothing is underlined", async () => {
    const writing = editing(ACTION);
    expect(drawn(await contextMenuItems(writing.host, 1))).not.toContain("Add to Dictionary");
  });
});

describe("adding an item", () => {
  it("is one entry in the command table: a command with a context is drawn, in table order", async () => {
    const run = vi.fn();
    const extra = { id: "test-extra", label: "Test Extra", context: { group: "test-group" }, run };
    const table = COMMANDS as Command[];
    table.push(extra);
    try {
      const writing = editing(ACTION);
      const entries = await contextMenuItems(writing.host, 1);
      expect(drawn(entries).slice(-2)).toEqual(["---", "Test Extra"]);
      itemNamed(entries, "Test Extra").act();
      expect(run).toHaveBeenCalledOnce();
    } finally {
      table.pop();
    }
  });

  it("is for commands only: everything on the menu has a label and a command of its own", () => {
    const ids = COMMANDS.filter((command) => command.context !== undefined).map((command) => command.id);
    expect(ids).toEqual(["cut", "copy", "paste", "select-all", "make-dual-dialogue", "make-normal-dialogue", "swap-speakers"]);
  });
});

describe("paste from the menu", () => {
  it("goes through the same paste as Ctrl+V: a pasted line becomes the element the rules say", () => {
    const writing = editing("INT. A - DAY\n\nThey wait.\n");
    const from = startOfElement(writing.state(), 1);
    writing.view.dispatch(writing.state().tr.setSelection(TextSelection.create(writing.state().doc, from)));
    expect(pasteInto(writing.view, { text: "Quick.\n", html: "" })).toBe(true);
    expect(writing.saved()).toContain("Quick.");
    expect(pasteInto(writing.view, { text: "", html: "" })).toBe(false);
  });
});

describe("the paper wires it", () => {
  const editor = readFileSync(join(root, "app/src/workspaces/editor/editor.ts"), "utf8");

  it("suppresses the webview's own menu on the paper, whatever else happens", () => {
    const handler = editor.slice(editor.indexOf("const onContextMenu"), editor.indexOf("page.addEventListener(\"contextmenu\""));
    expect(handler.indexOf("event.preventDefault()")).toBeGreaterThan(-1);
    expect(handler.indexOf("event.preventDefault()")).toBeLessThan(handler.indexOf("view === undefined"));
  });

  it("opens from the keyboard too: the Menu key and Shift+F10", () => {
    expect(editor).toContain('event.key === "ContextMenu"');
    expect(editor).toMatch(/event\.key === "F10" && event\.shiftKey/);
  });

  it("takes the menu down when the Editor comes down", () => {
    const unmount = editor.slice(editor.indexOf("unmount: async"));
    // Both ways down: before the manuscript was read, and after.
    expect(unmount.match(/contextMenu\?\.close\(false\)/g)?.length).toBe(2);
    expect(unmount.match(/removeEventListener\("contextmenu"/g)?.length).toBe(2);
  });
});
