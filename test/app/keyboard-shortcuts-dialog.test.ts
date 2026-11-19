/**
 * Keyboard Shortcuts: a read-only glance at the keys, opened and closed with
 * Ctrl+K in the Editor and from View ▸ Keyboard Shortcuts.
 *
 * The rows are checked against the command table, not against a second copy
 * of it: a row the table does not answer, or a hint the menus would not draw,
 * fails here. The Tab circuit is checked against the surface's `TAB_CYCLE`.
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

describe("the Tab circuit", () => {
  it("is TAB_CYCLE in order, by the command table's names", () => {
    expect(tabCircuit()).toEqual(TAB_CYCLE.map((type) => commandById(`element-${type}`)!.label));
    expect(tabCircuit()).toEqual(["Scene Heading", "Action", "Character", "Dialogue", "Parenthetical", "Transition"]);
  });

  it("is drawn in its own section, and does not pretend Tab reaches Centered", () => {
    const { modal } = opened();
    const section = modal.querySelector(".shortcuts-circuit")!;
    const steps = [...section.querySelectorAll(".shortcuts-circuit__step")].map(
      (step) => step.querySelector("span:not([aria-hidden])")!.textContent,
    );
    expect(steps).toEqual(tabCircuit());
    expect(section.textContent).not.toContain("Centered");
    expect(TAB_CYCLE).not.toContain("centered");
    expect([...section.querySelectorAll(".shortcuts__key")].map((key) => key.textContent)).toEqual(["[Tab]", "[Shift + Tab]"]);
    // Not tangled into the generated list.
    expect(section.closest(".shortcuts__columns")).toBeNull();
  });
});

describe("the dialog", () => {
  it("is named for a screen reader, with no visible title", () => {
    const { modal } = opened();
    expect(modal.getAttribute("aria-label")).toBe("Keyboard Shortcuts");
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.firstElementChild!.classList.contains("new-project-dialog__form")).toBe(true);
    expect(modal.firstElementChild!.firstElementChild!.classList.contains("shortcuts__columns")).toBe(true);
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
    const frame = (px("--space-loose") + px("--rule-thin")) * 2;
    const width = px("--measure-shortcuts-column") * 2 + px("--space-vast") + frame;
    const groups = shortcutGroups();
    const label = px("--size-caption") * leadingTight();
    const group = (name: string): number =>
      label + px("--space-tight") + groups.find((one) => one.name === name)!.rows.length * px("--size-row");
    const column = (names: string[]): number =>
      names.map(group).reduce((sum, one) => sum + one, 0) + px("--space-roomy") * (names.length - 1);
    const columns = Math.max(column(["File", "Edit"]), column(["View", "Writing"]));
    const gap = px("--space-roomy");
    const divider = px("--rule-thin") + px("--space-row-gap");
    // The label's row, and one row of steps.
    const circuit = px("--size-row") + px("--space-tight") + px("--size-row");
    const actions = px("--size-row");
    const height = frame + columns + gap + divider + gap + circuit + gap + divider + gap + actions;
    return { width, height };
  };

  it("is the window the app opens at", () => {
    expect([appWindow.width, appWindow.height]).toEqual([1100, 820]);
  });

  it("packs to 650 by about 509, inside 1100 by 820, with the 24px margins", () => {
    // The sum headless Chrome measures too (650 × 509.19).
    expect(packed().width).toBe(650);
    expect(packed().height).toBeCloseTo(509.2, 5);
    expect(packed().width + px("--space-loose") * 2).toBeLessThanOrEqual(appWindow.width);
    expect(packed().height + px("--space-loose") * 2).toBeLessThanOrEqual(appWindow.height);
  });

  it("is two columns, set by the tokens the sum reads, and nothing inside scrolls", () => {
    const sheet = css("shortcuts.css");
    const frame = rule(sheet, ".new-project-dialog.shortcuts");
    expect(frame).toContain(
      "width: calc(var(--measure-shortcuts-column) * 2 + var(--space-shortcuts-columns) + var(--space-loose) * 2 + var(--rule-thin) * 2)",
    );
    expect(css("tokens.css")).toContain("--space-shortcuts-columns: var(--space-vast);");
    expect(frame).toContain("padding: var(--space-loose)");
    expect(rule(sheet, ".shortcuts__columns")).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(rule(sheet, ".shortcuts__row")).toContain("height: var(--size-row)");
    // No scroller of its own, and no height but the window's.
    expect(sheet).not.toMatch(/overflow/);
    expect(frame).not.toMatch(/(^|[\s;])height:/);
  });

  it("keeps inside a smaller window", () => {
    const frame = rule(css("shortcuts.css"), ".new-project-dialog.shortcuts");
    expect(frame).toContain("max-width: 100%");
    expect(frame).toContain("max-height: 100%");
  });

  it("dresses it as the other dialogs: their frame, label, divider and dim key", () => {
    const { modal } = opened();
    expect(modal.querySelectorAll(".drop-menu__divider")).toHaveLength(2);
    expect(modal.querySelector(".shortcuts__label")!.classList.contains("new-project-dialog__label")).toBe(true);
    expect(closeButton(modal).classList.contains("dialog-action")).toBe(true);
    expect(rule(css("shortcuts.css"), ".shortcuts__key")).toContain("color: var(--colour-faint)");
    expect(css("menus.css")).toMatch(/\.drop-menu__hint\s*\{[^}]*color: var\(--colour-faint\)/);
  });
});
