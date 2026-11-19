/**
 * Keyboard Shortcuts: a read-only glance at the keys, opened and closed with
 * Ctrl+K in the Editor and from View ▸ Keyboard Shortcuts.
 *
 * The rows are checked against the command table, not against a second copy
 * of it: a row the table does not answer, or a hint the menus would not draw,
 * fails here. Tab Order is checked against the surface's `TAB_CYCLE`.
 */
// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHome } from "../../app/src/screens/home.ts";
import { answerKey } from "../../app/src/screens/shortcuts.ts";
import type { MountedWorkspace, WorkspaceContext } from "../../app/src/shell/workspace.ts";
import { COMMANDS, commandById, hintOf, type CommandHost } from "../../app/src/workspaces/editor/commands.ts";
import {
  openKeyboardShortcutsDialog,
  shortcutGroups,
  tabCircuit,
} from "../../app/src/workspaces/editor/keyboard-shortcuts-dialog.ts";
import { editorMenus } from "../../app/src/workspaces/editor/menus.ts";
import { importProject } from "../../src/project/import.ts";
import { openProject } from "../../src/project/open.ts";
import { NUMBERED_TYPES, TAB_CYCLE } from "../../src/screenplay/element-keys.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The Rust dictionary is not here; the fake stands in for it.
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const style = join(root, "app", "src", "style");
const css = (name: string): string => readFileSync(join(style, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sheet: string, selector: string): string =>
  new RegExp(`(?:^|\\})\\s*${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(sheet)![1]!;
/** A token's size in pixels. */
const px = (token: string): number => Number(new RegExp(`${token}: ([\\d.]+)px;`).exec(css("tokens.css"))![1]);
const leadingTight = (): number => Number(/--leading-tight: ([\d.]+);/.exec(css("tokens.css"))![1]);

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

afterEach(() => {
  document.body.replaceChildren();
});

function opened() {
  const into = document.createElement("div");
  document.body.append(into);
  const closed = vi.fn();
  const modal = openKeyboardShortcutsDialog(into, { closed });
  return { into, modal, closed };
}
/** A key pressed on whatever holds the focus. */
const press = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};
/** Escape as the webview treats it: the `<dialog>` cancels unless the key was used. */
const escape = (modal: HTMLDialogElement): void => {
  const event = press("Escape");
  const cancel = new Event("cancel", { cancelable: true });
  modal.dispatchEvent(cancel);
  if (!event.defaultPrevented && !cancel.defaultPrevented) modal.close();
};
const closeButton = (modal: HTMLElement): HTMLButtonElement => modal.querySelector<HTMLButtonElement>(".dialog-action")!;
/** The rows drawn, group by group: `[label, hint]`. */
const drawnGroups = (modal: HTMLElement): Record<string, [string, string][]> =>
  Object.fromEntries(
    [...modal.querySelectorAll(".shortcuts__group")].map((group) => [
      group.querySelector(".shortcuts__label")!.textContent,
      [...group.querySelectorAll(".shortcuts__row")].map((row) => [
        row.firstElementChild!.textContent!,
        row.querySelector(".shortcuts__key")!.textContent!,
      ]),
    ]),
  );

describe("the list, generated from the command table", () => {
  const keyed = COMMANDS.filter((command) => hintOf(command) !== undefined);

  it("lists every command with a key, once, with the hint the menus draw", () => {
    const { modal } = opened();
    const rows = Object.values(drawnGroups(modal)).flat();
    expect(rows).toHaveLength(keyed.length);
    expect(new Set(rows.map(([label]) => label))).toEqual(new Set(keyed.map((command) => command.label)));
    for (const [label, hint] of rows) {
      const command = COMMANDS.find((one) => one.label === label)!;
      expect(hint, label).toBe(hintOf(command));
    }
  });

  it("draws exactly what the generator gives, in its groups and order", () => {
    const { modal } = opened();
    expect(drawnGroups(modal)).toEqual(
      Object.fromEntries(shortcutGroups().map((group) => [group.name, group.rows.map((row) => [row.label, row.hint])])),
    );
  });

  it("groups by the table: File, Edit (with the clipboard), View, and Writing for the rest", () => {
    const ids = (name: string): string[] =>
      shortcutGroups()
        .find((group) => group.name === name)!
        .rows.map((row) => COMMANDS.find((command) => command.label === row.label)!.id);
    expect(shortcutGroups().map((group) => group.name)).toEqual(["File", "Edit", "View", "Writing"]);
    expect(ids("File")).toEqual(["save", "to-home"]);
    expect(ids("Edit")).toEqual(["undo", "redo", "cut", "copy", "paste", "select-all"]);
    expect(ids("View")).toEqual(["toggle-spellcheck", "keyboard-shortcuts"]);
    expect(ids("Writing")).toEqual(["search", ...NUMBERED_TYPES.map((type) => `element-${type}`)]);
  });

  it("includes itself, at Ctrl+K", () => {
    const view = shortcutGroups().find((group) => group.name === "View")!;
    expect(view.rows).toContainEqual({ label: commandById("keyboard-shortcuts")!.label, hint: "[Ctrl + K]" });
  });

  it("leaves out every command with no key", () => {
    const { modal } = opened();
    const labels = Object.values(drawnGroups(modal)).flat().map(([label]) => label);
    const keyless = COMMANDS.filter((command) => hintOf(command) === undefined);
    expect(keyless.map((command) => command.id)).toEqual(
      expect.arrayContaining(["export-as", "rename-project", "edit-title-page", "view-title-page", "make-dual-dialogue"]),
    );
    for (const command of keyless) expect(labels, command.id).not.toContain(command.label);
  });

  it("shows no key the table does not answer", () => {
    const { modal } = opened();
    const known = new Set(keyed.map((command) => hintOf(command)));
    for (const [label, hint] of Object.values(drawnGroups(modal)).flat()) expect(known.has(hint), label).toBe(true);
    expect(modal.textContent).not.toContain("Shift + Z");
  });
});

describe("Tab Order", () => {
  /** The section, and its names top to bottom. */
  const tabOrder = (modal: HTMLElement) => {
    const section = modal.querySelector<HTMLElement>(".shortcuts-tab-order")!;
    const steps = [...section.querySelectorAll(".shortcuts-loop__step")];
    return { section, steps, names: steps.map((step) => step.querySelector(".shortcuts-loop__name")!.textContent) };
  };

  it("is TAB_CYCLE in order, by the command table's names", () => {
    expect(tabCircuit()).toEqual(TAB_CYCLE.map((type) => commandById(`element-${type}`)!.label));
    expect(tabCircuit()).toEqual(["Scene Heading", "Action", "Character", "Dialogue", "Parenthetical", "Transition"]);
  });

  it("sits inside Writing, after its rows, and is not one of them", () => {
    const { modal } = opened();
    const { section } = tabOrder(modal);
    const writing = section.closest(".shortcuts__group")!;
    expect(writing.querySelector(".shortcuts__label")!.textContent).toBe("Writing");
    expect(writing.lastElementChild).toBe(section);
    expect(section.closest(".shortcuts__row")).toBeNull();
    expect(section.querySelector(".shortcuts__row")).toBeNull();
    expect(section.querySelector(".shortcuts__label")!.textContent).toBe("Tab Order");
    expect(modal.querySelectorAll(".shortcuts-tab-order")).toHaveLength(1);
  });

  it("stacks TAB_CYCLE top to bottom, with the keys beside it, and does not pretend Tab reaches Centered", () => {
    const { modal } = opened();
    const { section, names } = tabOrder(modal);
    expect(names).toEqual(tabCircuit());
    expect(section.querySelector("ol")).not.toBeNull();
    expect(section.textContent).not.toContain("Centered");
    expect(TAB_CYCLE).not.toContain("centered");
    expect([...section.querySelectorAll(".shortcuts__key")].map((key) => key.textContent)).toEqual(["[Tab]", "[Shift + Tab]"]);
  });

  it("draws a separate step arrow out of each name into the next, five of them, and no rail", () => {
    const { modal } = opened();
    const { section, steps } = tabOrder(modal);
    const last = steps.length - 1;
    const arrows = [...section.querySelectorAll(".shortcuts-loop__step-arrow")];
    // One for each pair TAB_CYCLE steps through: Scene Heading → Action, … Parenthetical → Transition.
    expect(arrows).toHaveLength(TAB_CYCLE.length - 1);
    expect(arrows).toHaveLength(5);
    const pairs = arrows.map((arrow) => {
      const from = arrow.closest(".shortcuts-loop__step")!;
      const to = from.nextElementSibling!;
      return [from, to].map((step) => step.querySelector(".shortcuts-loop__name")!.textContent);
    });
    expect(pairs).toEqual(tabCircuit().slice(0, -1).map((name, at) => [name, tabCircuit()[at + 1]]));
    expect(pairs).toEqual([
      ["Scene Heading", "Action"],
      ["Action", "Character"],
      ["Character", "Dialogue"],
      ["Dialogue", "Parenthetical"],
      ["Parenthetical", "Transition"],
    ]);
    // Each its own piece, with its own arrowhead, after its name; none out of the last.
    steps.forEach((step, at) => {
      const own = step.querySelectorAll(".shortcuts-loop__step-arrow");
      expect(own, String(at)).toHaveLength(at === last ? 0 : 1);
      if (at !== last) {
        expect(step.lastElementChild).toBe(own[0]);
        expect(own[0]!.querySelectorAll(".shortcuts-loop__head"), String(at)).toHaveLength(1);
      }
    });
    // Not one rail with ticks: no line runs the length of the list on the right, and no start arrow of its own.
    expect(section.querySelector("[class*='rail'], [class*='tie'], [class*='lead']")).toBeNull();
    expect(section.querySelectorAll(".shortcuts-loop__head")).toHaveLength(TAB_CYCLE.length);
  });

  it("draws one longer return arrow, apart from the steps, from the last back into the first", () => {
    const { modal } = opened();
    const { section } = tabOrder(modal);
    const loop = section.querySelector(".shortcuts-loop")!;
    const returns = loop.querySelectorAll(".shortcuts-loop__return");
    expect(returns).toHaveLength(1);
    const back = returns[0]!;
    // Beside the list, not inside any one name's row, and not one of the steps.
    expect(back.parentElement).toBe(loop);
    expect(back.closest(".shortcuts-loop__step")).toBeNull();
    expect(back.classList.contains("shortcuts-loop__step-arrow")).toBe(false);
    // Its one arrowhead points back into the first.
    expect([...back.querySelectorAll(".shortcuts-loop__head")].map((head) => head.className)).toEqual([
      "shortcuts-loop__head shortcuts-loop__head--back",
    ]);
    // The drawing is for the eye: a screen reader hears the names and the list's label.
    for (const piece of section.querySelectorAll("[class*='shortcuts-loop__']:not(.shortcuts-loop__steps):not(.shortcuts-loop__step):not(.shortcuts-loop__name)")) {
      expect(piece.closest("[aria-hidden='true']"), piece.className).not.toBeNull();
    }
    expect(section.querySelector("ol")!.getAttribute("aria-label")).toContain("go round");
  });

  it("draws its arrows thin and dim, sized to the rows, each step stopping short of the next, the return the whole list long", () => {
    const sheet = css("shortcuts.css");
    const line = "var(--rule-thin) solid var(--colour-faint)";
    const step = rule(sheet, ".shortcuts-loop__step-arrow");
    for (const side of ["top", "right", "bottom"]) expect(step).toContain(`border-${side}: ${line}`);
    expect(step).not.toContain("border-left");
    // Out a little below one name's middle, in a little above the next one's: a gap between neighbours.
    expect(step).toContain("top: calc(50% + var(--space-shortcuts-arrows) / 2)");
    expect(step).toContain("height: calc(var(--size-row) - var(--space-shortcuts-arrows))");
    expect(step).toContain("width: calc(var(--size-shortcuts-arrowhead) * 2)");
    const gap = px("--space-tight");
    expect(css("tokens.css")).toContain("--space-shortcuts-arrows: var(--space-tight);");
    // The names sit on the rows' own rhythm, one menu row apart, with no gap of their own.
    expect(rule(sheet, ".shortcuts-loop__step")).toContain("height: var(--size-row)");
    expect(rule(sheet, ".shortcuts-loop__steps")).not.toContain("gap");
    // Each arrow is 18px tall and 8px wide where one name's middle is 24px from the next: 6px of nothing between
    // neighbours. Smaller than the 20 × 10 it was beside 30px steps, so it is not oversized next to the rows.
    const pitch = px("--size-row");
    const head = px("--size-shortcuts-arrowhead");
    expect([pitch, pitch - gap, head * 2, gap]).toEqual([24, 18, 8, 6]);
    expect(pitch - gap).toBeLessThan(20);
    expect(head * 2).toBeLessThan(10);
    // The arrowhead, a 4px square turned on end, smaller than the 6px it was, stays inside that gap and does not
    // touch the next arrow.
    const head_ = rule(sheet, ".shortcuts-loop__head");
    expect(head_).toContain("width: var(--size-shortcuts-arrowhead)");
    expect(head_).toContain("height: var(--size-shortcuts-arrowhead)");
    expect(head).toBeLessThan(px("--space-tight"));
    expect((head * Math.SQRT2) / 2).toBeLessThan(gap);

    const back = rule(sheet, ".shortcuts-loop__return");
    for (const side of ["top", "left", "bottom"]) expect(back).toContain(`border-${side}: ${line}`);
    expect(back).not.toContain("border-right");
    expect(back).toContain("top: calc(var(--size-row) / 2)");
    expect(back).toContain("bottom: calc(var(--size-row) / 2)");
    expect(rule(sheet, ".shortcuts-loop__head")).toContain(`border-left: ${line}`);
    expect(rule(sheet, ".shortcuts-loop__head")).toContain(`border-bottom: ${line}`);
    expect(sheet).not.toMatch(/rail|__tie|__lead/);
  });
});

describe("the layout: two columns and a divider stood on end", () => {
  const columns = (modal: HTMLElement): Element[] => [...modal.querySelectorAll(".shortcuts__column")];
  const names = (column: Element): string[] =>
    [...column.querySelectorAll(".shortcuts__group > .shortcuts__label")].map((label) => label.textContent!);

  it("puts File, Edit and View down one side, and Writing alone on the other", () => {
    const { modal } = opened();
    expect(columns(modal).map(names)).toEqual([["File", "Edit", "View"], ["Writing"]]);
  });

  it("has one divider, vertical, between the two columns, and no horizontal one", () => {
    const { modal } = opened();
    expect(modal.querySelectorAll(".drop-menu__divider")).toHaveLength(0);
    const dividers = modal.querySelectorAll("[role='separator']");
    expect(dividers).toHaveLength(1);
    const divider = dividers[0]!;
    expect(divider.classList.contains("shortcuts__divider")).toBe(true);
    expect(divider.getAttribute("aria-orientation")).toBe("vertical");
    const [left, right] = columns(modal);
    expect(divider.previousElementSibling).toBe(left);
    expect(divider.nextElementSibling).toBe(right);
  });

  it("draws the divider as the right-click menu's, stood on end, and held in at the top and bottom", () => {
    const sheet = css("shortcuts.css");
    expect(rule(sheet, ".shortcuts__columns")).toContain(
      "grid-template-columns: minmax(0, 1fr) var(--rule-thin) minmax(0, 1fr)",
    );
    const divider = rule(sheet, ".shortcuts__divider");
    expect(divider).toContain("background: var(--colour-border)");
    expect(divider).toContain("align-self: stretch");
    // The menu's divider is held in from the sides by --space-row-label; this one from the top and bottom.
    expect(divider).toContain("margin: var(--space-row-label) 0");
    expect(rule(css("menus.css"), ".drop-menu__divider")).toMatch(/margin: [^;]* var\(--space-row-label\);/);
    expect(rule(css("menus.css"), ".drop-menu__divider")).toContain("background: var(--colour-border)");
  });
});

describe("the keys, drawn as the menus' hints", () => {
  it("are plain text, in the rows and beside Tab Order: no `.pill`, and none is a button", () => {
    const { modal } = opened();
    const keys = [...modal.querySelectorAll(".shortcuts__key")];
    expect(keys).toHaveLength(COMMANDS.filter((command) => hintOf(command) !== undefined).length + 2);
    expect(keys.map((key) => key.textContent)).toEqual(expect.arrayContaining(["[Ctrl + S]", "[Tab]", "[Shift + Tab]"]));
    for (const key of keys) {
      expect(key.className, key.textContent!).toBe("shortcuts__key");
      expect(key.tagName).toBe("SPAN");
      expect(key.children).toHaveLength(0);
    }
    expect(modal.querySelector(".pill")).toBeNull();
  });

  it("take the dim of the menus' own hints, with no background, edge or height of a pill", () => {
    const sheet = css("shortcuts.css");
    const key = rule(sheet, ".shortcuts__key");
    expect(key).toContain("color: var(--colour-faint)");
    expect(rule(css("menus.css"), ".drop-menu__hint")).toContain("color: var(--colour-faint)");
    expect(key).not.toMatch(/background|border|height|padding|radius/);
    // Nothing of the pill anywhere in the dialog's sheet.
    expect(sheet).not.toMatch(/\.pill|--size-pill|--radius-float|--colour-border-strong/);
  });

  it("set each row a menu row tall, one straight after the next", () => {
    const sheet = css("shortcuts.css");
    expect(rule(sheet, ".shortcuts__row")).toContain("height: var(--size-row)");
    expect(rule(sheet, ".shortcuts-tab-order__head")).toContain("height: var(--size-row)");
    expect(rule(css("menus.css"), ".drop-menu__item")).toContain("height: var(--size-row)");
    expect(rule(sheet, ".shortcuts__rows")).not.toContain("gap");
    expect(css("tokens.css")).not.toContain("--space-shortcuts-rows");
    // 24px from one row to the next, where it was a 32px pill and a 10px gap.
    expect(px("--size-row")).toBe(24);
    expect(px("--size-row")).toBeLessThan(px("--size-pill") + px("--space-snug"));
  });

  it("sit further from their names than before", () => {
    expect(rule(css("shortcuts.css"), ".shortcuts__row")).toContain("gap: var(--space-shortcuts-key)");
    expect(css("tokens.css")).toContain("--space-shortcuts-key: var(--space-loose);");
    // Was --space-panel, 12px.
    expect(px("--space-loose")).toBeGreaterThan(px("--space-panel"));
  });
});

describe("the dialog", () => {
  it("is named for a screen reader, with no visible title", () => {
    const { modal } = opened();
    expect(modal.getAttribute("aria-label")).toBe("Keyboard Shortcuts");
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.firstElementChild!.classList.contains("new-project-dialog__form")).toBe(true);
    expect([...modal.firstElementChild!.children].map((child) => child.className)).toEqual([
      "shortcuts__columns",
      "new-project-dialog__actions",
    ]);
  });

  it("opens with nothing focused: the dialog itself holds the focus", () => {
    const { modal } = opened();
    expect(document.activeElement).toBe(modal);
    expect(document.activeElement).not.toBe(closeButton(modal));
  });

  it("has one button, Close [Esc], and Tab reaches it", () => {
    const { modal } = opened();
    const buttons = [...modal.querySelectorAll("button")];
    expect(buttons).toEqual([closeButton(modal)]);
    expect(closeButton(modal).textContent).toContain("Close");
    expect(closeButton(modal).textContent).toContain("[Esc]");
    expect(closeButton(modal).textContent).not.toContain("K");
    press("Tab");
    expect(document.activeElement).toBe(closeButton(modal));
  });

  it("closes on Escape, on Close, and on its own key", () => {
    const first = opened();
    escape(first.modal);
    expect(first.closed).toHaveBeenCalledOnce();
    expect(first.modal.isConnected).toBe(false);

    const second = opened();
    closeButton(second.modal).click();
    expect(second.closed).toHaveBeenCalledOnce();

    const third = opened();
    press("k", { ctrlKey: true });
    expect(third.closed).toHaveBeenCalledOnce();

    const fourth = opened();
    press("K", { metaKey: true });
    expect(fourth.closed).toHaveBeenCalledOnce();
  });

  it("does not close on a Ctrl+K that is still held down", () => {
    const { closed } = opened();
    press("k", { ctrlKey: true, repeat: true });
    expect(closed).not.toHaveBeenCalled();
  });
});

describe("View ▸ Keyboard Shortcuts", () => {
  it("is in the View menu with its key, in its own group, and runs the toggle", () => {
    const keyboardShortcuts = vi.fn();
    const host = { keyboardShortcuts, spellcheckOn: () => false, view: () => undefined } as unknown as CommandHost;
    const view = editorMenus(host)["View"]!;
    const item = view.find((entry) => "label" in entry && entry.label === "Keyboard Shortcuts");
    expect(item).toMatchObject({ hint: "[Ctrl + K]" });
    expect(view[view.indexOf(item!) - 1]).toEqual({ divider: true });
    expect(commandById("keyboard-shortcuts")).toMatchObject({ keys: "window", menu: { name: "View", group: "shortcuts" } });
    expect(commandById("keyboard-shortcuts")!.icon).toBeDefined();
    (item as { act: () => void }).act();
    expect(keyboardShortcuts).toHaveBeenCalledOnce();
  });
});

describe("Ctrl+K in the Editor", () => {
  let temporary: { path: string; remove: () => void };
  beforeEach(() => {
    temporary = temporaryDirectory();
  });
  afterEach(() => {
    temporary.remove();
  });

  async function editor(): Promise<{ into: HTMLElement; mounted: MountedWorkspace }> {
    const into = document.createElement("div");
    document.body.append(into);
    const source = join(temporary.path, "Brick-&-Steel.fountain");
    writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
    const imported = await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
      { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
    );
    const project = await openProject(nodeFilesystem, imported.project);
    const quiet = (): (() => void) => () => {};
    const context = {
      project: project.project,
      filesystem: nodeFilesystem,
      report: () => {},
      setStatus: () => {},
      setGoal: () => {},
      whenGoalsAsked: quiet,
      whenRenameAsked: quiet,
      setSaved: () => {},
      setSpellcheck: () => {},
      whenSwitchedAway: quiet,
      whenSwitchedBack: quiet,
      leave: { toProjects: () => {}, toHome: () => {} },
      ledger: () => undefined,
      places: () => undefined,
      chooseCopyLocation: async () => undefined,
      choosePdfLocation: async () => undefined,
    } as unknown as WorkspaceContext;
    const mounted = editorWorkspace.mount(into, context);
    await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
    return { into, mounted };
  }
  const shown = (into: HTMLElement): HTMLDialogElement | null => into.querySelector("dialog.shortcuts[open]");

  it("opens it from the paper, and the same key closes it again", async () => {
    const { into, mounted } = await editor();
    expect(document.activeElement).toBe(into.querySelector(".ProseMirror"));
    const event = press("k", { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(shown(into)).not.toBeNull();
    expect(document.activeElement).toBe(shown(into));
    press("k", { ctrlKey: true });
    expect(shown(into)).toBeNull();
    // The writer is back on the paper.
    expect(document.activeElement).toBe(into.querySelector(".ProseMirror"));
    press("K", { metaKey: true });
    expect(shown(into)).not.toBeNull();
    press("k", { metaKey: true });
    expect(shown(into)).toBeNull();
    await mounted.unmount();
  });

  it("closes on Escape and on Close", async () => {
    const { into, mounted } = await editor();
    press("k", { ctrlKey: true });
    escape(shown(into)!);
    expect(shown(into)).toBeNull();
    press("k", { ctrlKey: true });
    closeButton(shown(into)!).click();
    expect(shown(into)).toBeNull();
    await mounted.unmount();
  });

  it("is not toggled by a held key", async () => {
    const { into, mounted } = await editor();
    press("k", { ctrlKey: true });
    press("k", { ctrlKey: true, repeat: true });
    expect(shown(into)).not.toBeNull();
    await mounted.unmount();
  });

  it("does not open over another dialog", async () => {
    const { into, mounted } = await editor();
    const other = document.createElement("dialog");
    into.append(other);
    other.showModal();
    other.focus();
    press("k", { ctrlKey: true });
    expect(shown(into)).toBeNull();
    other.close();
    await mounted.unmount();
  });

  it("does nothing once the Editor is gone", async () => {
    const { into, mounted } = await editor();
    await mounted.unmount();
    press("k", { ctrlKey: true });
    expect(document.querySelector("dialog.shortcuts")).toBeNull();
    expect(into.querySelector("dialog")).toBeNull();
  });
});

describe("on Home", () => {
  it("Ctrl+K opens nothing: Home has no such key, and the dialog is the Editor's alone", () => {
    const into = document.createElement("div");
    document.body.append(into);
    const drawn = renderHome(into, { onNewProject: vi.fn(), onOpenProject: vi.fn(), onQuit: vi.fn() });
    const ctrlK = { key: "k", altKey: false, ctrlKey: true, metaKey: false };
    expect(answerKey(ctrlK, { dialogOpen: false, gestures: drawn.gestures, navigate: drawn.navigate })).toBe(false);
    press("k", { ctrlKey: true });
    expect(document.querySelector("dialog")).toBeNull();

    // Only the Editor opens it.
    const app = join(root, "app", "src");
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts")) files.push(path);
      }
    };
    walk(app);
    const openers = files.filter((path) => readFileSync(path, "utf8").includes("openKeyboardShortcutsDialog("));
    expect(openers.map((path) => path.slice(app.length + 1)).sort()).toEqual([
      "workspaces/editor/editor.ts",
      "workspaces/editor/keyboard-shortcuts-dialog.ts",
    ]);
  });
});

describe("one page, nothing scrolled, in the app's window", () => {
  /** The default window (`src-tauri/tauri.conf.json`). */
  const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")) as {
    app: { windows: { width: number; height: number }[] };
  };
  const appWindow = conf.app.windows[0]!;

  /** The packed size from the tokens: jsdom lays nothing out. */
  const packed = () => {
    const frame = (px("--space-vast") + px("--rule-thin")) * 2;
    const columns = px("--space-vast") + px("--space-loose");
    const width = px("--measure-shortcuts-column") * 2 + columns * 2 + px("--rule-thin") + frame;
    const groups = shortcutGroups();
    const label = px("--size-caption") * leadingTight();
    const group = (name: string): number => {
      const rows = groups.find((one) => one.name === name)!.rows.length;
      return label + px("--space-tight") + rows * px("--size-row");
    };
    const left = ["File", "Edit", "View"].map(group).reduce((sum, one) => sum + one, 0) + px("--space-loose") * 2;
    // Spaced from Writing's rows as one group is from the next; its head a row; a row for each type.
    const steps = TAB_CYCLE.length * px("--size-row");
    const tabOrder = px("--space-loose") + px("--size-row") + px("--space-tight") + steps;
    const right = group("Writing") + tabOrder;
    const actions = px("--space-dialog-actions") + px("--size-row");
    const height = frame + Math.max(left, right) + actions;
    return { width, height, left, right };
  };

  it("is the window the app opens at", () => {
    expect([appWindow.width, appWindow.height]).toEqual([1100, 820]);
  });

  it("packs to 891 by about 538, inside 1100 by 820, with 40px margins", () => {
    // The sum headless Chrome measures too.
    expect(packed().width).toBe(891);
    expect(packed().height).toBeCloseTo(537.6, 5);
    // As wide as it was with the pills, and shorter than their 713.6.
    expect(packed().height).toBeLessThan(713.6);
    expect(713.6 - packed().height).toBeGreaterThan(150);
    // Writing and Tab Order are the taller side.
    expect(packed().right).toBeGreaterThan(packed().left);
    // Room to spare all round, so nothing scrolls.
    expect(packed().width + px("--space-loose") * 2).toBeLessThanOrEqual(appWindow.width);
    expect(packed().height + px("--space-loose") * 2).toBeLessThanOrEqual(appWindow.height);
  });

  it("has a wider margin than the other dialogs", () => {
    expect(css("tokens.css")).toContain("--space-shortcuts-edge: var(--space-vast);");
    expect(px("--space-vast")).toBeGreaterThan(px("--space-loose"));
    expect(rule(css("shortcuts.css"), ".new-project-dialog.shortcuts")).toContain("padding: var(--space-shortcuts-edge)");
  });

  it("spreads the columns wider apart, and further from the divider, than before", () => {
    // Was 300px columns and --space-vast (40px) either side of the divider.
    expect(px("--measure-shortcuts-column")).toBeGreaterThan(300);
    const columns = px("--space-vast") + px("--space-loose");
    expect(columns).toBe(64);
    expect(columns).toBeGreaterThan(40);
  });

  it("keeps the room across that the pills had: only the rows got closer", () => {
    const tokens = css("tokens.css");
    expect(tokens).toContain("--space-shortcuts-key: var(--space-loose);");
    expect(tokens).toContain("--space-shortcuts-edge: var(--space-vast);");
    // Label to key, column, either side of the divider, the edge.
    expect([
      px("--space-loose"),
      px("--measure-shortcuts-column"),
      px("--space-vast") + px("--space-loose"),
      px("--space-vast"),
    ]).toEqual([24, 340, 64, 40]);
  });

  it("is two columns and a divider, set by the tokens the sum reads, and nothing inside scrolls", () => {
    const sheet = css("shortcuts.css");
    const frame = rule(sheet, ".new-project-dialog.shortcuts").replace(/\s+/g, " ");
    expect(frame).toContain(
      "width: calc( var(--measure-shortcuts-column) * 2 + var(--space-shortcuts-columns) * 2 + var(--rule-thin) + var(--space-shortcuts-edge) * 2 + var(--rule-thin) * 2 )",
    );
    expect(css("tokens.css")).toContain("--measure-shortcuts-column: 340px;");
    expect(css("tokens.css")).toContain("--space-shortcuts-columns: calc(var(--space-vast) + var(--space-loose));");
    expect(rule(sheet, ".shortcuts__columns")).toContain("gap: var(--space-shortcuts-columns)");
    expect(rule(sheet, ".shortcuts-loop__step")).toContain("height: var(--size-row)");
    expect(rule(sheet, ".shortcuts-tab-order")).toContain("margin-block-start: calc(var(--space-loose) - var(--space-tight))");
    expect(rule(sheet, ".shortcuts-tab-order")).toContain("gap: var(--space-tight)");
    expect(rule(sheet, ".shortcuts__column")).toContain("gap: var(--space-loose)");
    // No scroller of its own, and no height but the window's.
    expect(sheet).not.toMatch(/overflow/);
    expect(frame).not.toMatch(/(^|[\s;])height:/);
  });

  it("keeps inside a smaller window", () => {
    const frame = rule(css("shortcuts.css"), ".new-project-dialog.shortcuts");
    expect(frame).toContain("max-width: 100%");
    expect(frame).toContain("max-height: 100%");
  });

  it("dresses it as the other dialogs: their frame, label and button", () => {
    const { modal } = opened();
    expect(modal.querySelector(".shortcuts__label")!.classList.contains("new-project-dialog__label")).toBe(true);
    expect(closeButton(modal).classList.contains("dialog-action")).toBe(true);
  });
});
