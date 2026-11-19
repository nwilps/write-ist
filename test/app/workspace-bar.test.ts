/**
 * The workspace bar (the desk design, §2.3): one tab for each workspace in the
 * registry, named by its manifest, the first of them active. A click selects a
 * tab, and so do Alt and its manifest key, and Alt+Left and Alt+Right.
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import type { WorkspaceManifest } from "../../app/src/shell/workspace.ts";
import { WORKSPACES } from "../../app/src/workspaces/registry.ts";
import { COMMANDS, commandById, hintOf } from "../../app/src/workspaces/editor/commands.ts";
import { shortcutGroups } from "../../app/src/workspaces/editor/keyboard-shortcuts-dialog.ts";

const style = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "src", "style");
const editor = readFileSync(join(style, "editor.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [...editor.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.map((match) => match[1]).join("\n");
}

/** Shells put up by a test, taken down after it so their keys stop listening. */
const up: MountedShell[] = [];
afterEach(async () => {
  await Promise.all(up.splice(0).map((shell) => shell.unmount()));
  document.body.replaceChildren();
});

/** How many times each workspace was mounted, and how many taken down. */
const mounts = new Map<string, { mounted: number; unmounted: number }>();

function shellOf(workspaces: readonly WorkspaceManifest[]): HTMLElement {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  mounts.clear();
  const shell = mountShell(into, {
    project: { path: "/p", marker: { name: "Big Fish" } } as never,
    filesystem: {} as never,
    workspaces: workspaces.map((w) => ({
      ...w,
      mount: (host: HTMLElement) => {
        const count = mounts.get(w.id) ?? { mounted: 0, unmounted: 0 };
        mounts.set(w.id, count);
        count.mounted += 1;
        host.append(Object.assign(document.createElement("p"), { className: `mounted-${w.id}`, textContent: w.name }));
        return {
          unmount: async () => {
            count.unmounted += 1;
            return true;
          },
        };
      },
    })),
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    askToRename: () => {},
    openSettings: () => {},
    ledger: () => undefined,
    places: () => undefined,
  });
  up.push(shell);
  return into;
}

const tabsOf = (into: HTMLElement): HTMLButtonElement[] => [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const selectedOf = (into: HTMLElement): string[] =>
  tabsOf(into)
    .filter((tab) => tab.getAttribute("aria-selected") === "true")
    .map((tab) => tab.textContent!);

/** A key pressed on whatever holds the focus, as the window would see it. */
function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}
const alt = (key: string): KeyboardEvent => press(key, { altKey: true });

describe("the workspace bar", () => {
  it("has Editor, Notes and Plan tabs, each with a Lucide icon, and Editor is the active one", () => {
    const tabs = [...shellOf(WORKSPACES).querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Editor", "Notes", "Plan"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    for (const tab of tabs) expect(tab.querySelector("svg.workspace-bar__icon")).not.toBeNull();
  });

  it("takes a tab from every manifest, never from the shell", () => {
    const second: WorkspaceManifest = { ...WORKSPACES[0]!, id: "other", name: "Elsewhere" };
    const tabs = [...shellOf([...WORKSPACES, second]).querySelectorAll('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Editor", "Notes", "Plan", "Elsewhere"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
  });

  it("is a raised pill with a strong border and a shadow, active tab in the accent", () => {
    const pill = rule(".workspace-bar__pill");
    expect(pill).toContain("background: var(--colour-raised)");
    expect(pill).toContain("var(--colour-border-strong)");
    expect(pill).toContain("box-shadow: var(--shadow-float)");
    expect(rule('.workspace-bar__tab[aria-selected="true"]')).toContain("var(--colour-accent)");
    expect(rule(".workspace-bar__tab")).toContain("var(--colour-muted)");
  });
});

describe("choosing a tab", () => {
  it("Alt+1, Alt+2 and Alt+3 select Editor, Notes and Plan, by the manifests' keys", () => {
    const into = shellOf(WORKSPACES);
    expect(WORKSPACES.map((workspace) => workspace.key)).toEqual(["1", "2", "3"]);
    expect(alt("2").defaultPrevented).toBe(true);
    expect(selectedOf(into)).toEqual(["Notes"]);
    alt("3");
    expect(selectedOf(into)).toEqual(["Plan"]);
    alt("1");
    expect(selectedOf(into)).toEqual(["Editor"]);
  });

  it("Alt+Left and Alt+Right step through the tabs and go round at the ends, kept from the webview's Back and Forward", () => {
    const into = shellOf(WORKSPACES);
    const right = alt("ArrowRight");
    expect(right.defaultPrevented).toBe(true);
    expect(selectedOf(into)).toEqual(["Notes"]);
    alt("ArrowRight");
    expect(selectedOf(into)).toEqual(["Plan"]);
    alt("ArrowRight");
    expect(selectedOf(into)).toEqual(["Editor"]);
    const left = alt("ArrowLeft");
    expect(left.defaultPrevented).toBe(true);
    expect(selectedOf(into)).toEqual(["Plan"]);
    alt("ArrowLeft");
    expect(selectedOf(into)).toEqual(["Notes"]);
  });

  it("is heard wherever the focus is, even where something stops the key on its way out", () => {
    const into = shellOf(WORKSPACES);
    const field = document.createElement("div");
    field.tabIndex = 0;
    field.addEventListener("keydown", (event) => event.stopPropagation());
    into.querySelector(".workspace")!.append(field);
    field.focus();
    alt("3");
    expect(selectedOf(into)).toEqual(["Plan"]);
  });

  it("a click on a tab does what its key does, and leaves the focus where it was", () => {
    const into = shellOf(WORKSPACES);
    const [editor, notes, plan] = tabsOf(into);
    notes!.click();
    expect(selectedOf(into)).toEqual(["Notes"]);
    plan!.click();
    expect(selectedOf(into)).toEqual(["Plan"]);
    editor!.click();
    expect(selectedOf(into)).toEqual(["Editor"]);
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    notes!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it("keeps the Editor mounted and on screen while Notes or Plan is selected, and mounts nothing else", () => {
    const into = shellOf(WORKSPACES);
    alt("2");
    alt("3");
    tabsOf(into)[1]!.click();
    alt("1");
    expect(mounts.get("editor")).toEqual({ mounted: 1, unmounted: 0 });
    expect(mounts.has("notes")).toBe(false);
    expect(mounts.has("plan")).toBe(false);
    expect(into.querySelector(".mounted-editor")?.isConnected).toBe(true);
  });

  it("leaves other keys alone: Alt+Enter, the menus' Alt+F, E and V, Ctrl+1, a bare 1, and Alt+4 with no fourth tab", () => {
    const into = shellOf(WORKSPACES);
    for (const event of [alt("Enter"), alt("f"), alt("e"), alt("v"), alt("4"), press("1"), press("1", { ctrlKey: true }), press("ArrowRight")]) {
      expect(event.defaultPrevented, event.key).toBe(false);
    }
    expect(press("2", { altKey: true, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(selectedOf(into)).toEqual(["Editor"]);
  });

  it("is not heard while a dialog has the writer's attention", () => {
    const into = shellOf(WORKSPACES);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    expect(alt("2").defaultPrevented).toBe(false);
    expect(selectedOf(into)).toEqual(["Editor"]);
  });

  it("stops listening once the shell is down", async () => {
    const into = shellOf(WORKSPACES);
    await up.pop()!.unmount();
    alt("2");
    expect(selectedOf(into)).toEqual(["Editor"]);
  });

  it("takes a fourth tab's key from its manifest", () => {
    const fourth: WorkspaceManifest = { ...WORKSPACES[0]!, id: "other", name: "Elsewhere", key: "4" };
    const into = shellOf([...WORKSPACES, fourth]);
    alt("4");
    expect(selectedOf(into)).toEqual(["Elsewhere"]);
    alt("ArrowRight");
    expect(selectedOf(into)).toEqual(["Editor"]);
  });
});

describe("the tab keys in the command table and the Keyboard Shortcuts list", () => {
  it("name each workspace in the registry, with its manifest key, as [Alt + 1] and so on", () => {
    for (const workspace of WORKSPACES) {
      const command = commandById(`workspace-${workspace.id}`)!;
      expect(command.label).toBe(workspace.name);
      expect(command.chord).toEqual({ key: workspace.key, alt: true });
      expect(hintOf(command)).toBe(`[Alt + ${workspace.key}]`);
    }
    expect(hintOf(commandById("previous-workspace")!)).toBe("[Alt + Left]");
    expect(hintOf(commandById("next-workspace")!)).toBe("[Alt + Right]");
  });

  it("are answered by the shell, not the Editor, and run nothing there", () => {
    const ids = [...WORKSPACES.map((workspace) => `workspace-${workspace.id}`), "previous-workspace", "next-workspace"];
    for (const id of ids) {
      expect(commandById(id), id).toMatchObject({ keys: "elsewhere", listedUnder: "View" });
      expect(commandById(id)!.menu, id).toBeUndefined();
    }
  });

  it("claim no key another command claims anywhere, nor the menus' Alt+F, E and V", () => {
    const tabKeys = new Set(["1", "2", "3", "arrowleft", "arrowright"]);
    const others = COMMANDS.filter((command) => !/workspace/.test(command.id) && command.chord?.alt === true);
    for (const command of others) {
      for (const key of [command.chord!.key, ...(command.chord!.alsoKeys ?? [])]) {
        expect(tabKeys.has(key.toLowerCase()), command.id).toBe(false);
      }
    }
    for (const letter of ["f", "e", "v", "enter"]) expect(tabKeys.has(letter)).toBe(false);
  });

  it("are listed under View", () => {
    const view = shortcutGroups().find((group) => group.name === "View")!;
    expect(view.rows.slice(-5)).toEqual([
      { label: "Editor", hint: "[Alt + 1]" },
      { label: "Notes", hint: "[Alt + 2]" },
      { label: "Plan", hint: "[Alt + 3]" },
      { label: "Previous Workspace", hint: "[Alt + Left]" },
      { label: "Next Workspace", hint: "[Alt + Right]" },
    ]);
  });
});
