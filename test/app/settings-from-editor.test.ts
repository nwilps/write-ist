/**
 * Settings from an open project: File ▸ Settings… opens the same dialog Home's
 * `[s]` opens, over the paper, through the shell — which passes it on without
 * knowing what it is (ADR-0005).
 *
 * The real shell and Editor, wired as `main.ts` wires them, over Brick & Steel
 * in a temporary folder.
 */
// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openSettingsDialog } from "../../app/src/screens/settings.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import type { SettingsRequest } from "../../app/src/shell/workspace.ts";
import { importProject } from "../../src/project/import.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.ts";
import { RESERVED_KEYS, shortcutCommands, useKeyBindings } from "../../app/src/workspaces/editor/commands.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The Rust dictionary is not here; the fake stands in for it.
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

let temporary: { path: string; remove: () => void };
let shell: MountedShell | undefined;
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
});
beforeEach(() => {
  temporary = temporaryDirectory();
});

/** The settings in force, as `main.ts` holds them. */
let inForce: Settings = DEFAULT_SETTINGS;
afterEach(() => {
  inForce = DEFAULT_SETTINGS;
  useKeyBindings({});
});

/** What `main.ts` does with the request: the real dialog and keys, with ports that hold nothing. */
const openSettings = vi.fn(({ into, closed }: SettingsRequest) => {
  if (document.querySelector("dialog[open]") !== null) return;
  openSettingsDialog(into, {
    settings: () => inForce,
    change: async (next) => {
      inForce = next;
      useKeyBindings(next.keyBindings);
      return undefined;
    },
    shortcuts: { commands: shortcutCommands(), reserved: RESERVED_KEYS },
    dictionary: { words: async () => [], add: async () => true, remove: async () => true },
    graveyard: { list: async () => [], recover: async () => undefined, exile: async () => undefined },
    closed,
  });
});

async function editing() {
  const source = join(temporary.path, "Brick-&-Steel.fountain");
  writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
  const { project } = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
  );
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  shell = mountShell(into, {
    project,
    filesystem: nodeFilesystem,
    workspaces: [editorWorkspace],
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    ledger: () => undefined,
    places: () => undefined,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    askToEditDetails: () => {},
    openSettings,
  });
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  return { into, sheet: into.querySelector<HTMLElement>(".ProseMirror")! };
}

function fileItem(into: HTMLElement, label: string): HTMLButtonElement {
  return [...into.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent === label)!;
}
const settings = () => document.querySelector<HTMLDialogElement>('dialog[aria-label="Settings"][open]');

describe("File ▸ Settings…", () => {
  it("is in the File menu, in a group of its own, with no key", async () => {
    const { into } = await editing();
    const item = fileItem(into, "Settings…");
    expect(item).toBeDefined();
    // A rule on either side: not mixed into Save, nor into the project's own items.
    expect(item.previousElementSibling?.matches('[role="separator"], .drop-menu__divider')).toBe(true);
    expect(item.nextElementSibling?.matches('[role="separator"], .drop-menu__divider')).toBe(true);
    expect(item.querySelector(".drop-menu__hint")).toBeNull();
  });

  it("opens Settings over the paper, and Done gives the keys back to the paper", async () => {
    const { into, sheet } = await editing();
    fileItem(into, "Settings…").click();
    expect(openSettings).toHaveBeenCalled();
    const modal = settings()!;
    expect(modal).not.toBeNull();
    expect(into.contains(modal)).toBe(true);
    modal.querySelector<HTMLButtonElement>(".new-project-dialog__actions .dialog-action")!.click();
    expect(settings()).toBeNull();
    expect(document.activeElement).toBe(sheet);
  });

  it("opens nothing over a dialog that is already open", async () => {
    const { into } = await editing();
    fileItem(into, "Edit Title Page…").click();
    const asked = openSettings.mock.calls.length;
    fileItem(into, "Settings…").click();
    expect(openSettings.mock.calls.length).toBe(asked);
    expect(settings()).toBeNull();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
  });
});

describe("Search's two keys, and keys changed in Settings, on the paper", () => {
  const key = (key: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  };
  const searching = (into: HTMLElement) => into.querySelector(".search__query") !== null;
  const closeSearch = () => key("Escape");

  it("opens Search with Ctrl+F and with Alt+Enter", async () => {
    const { into, sheet } = await editing();
    sheet.focus();
    expect(key("f", { ctrlKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(searching(into)).toBe(true));
    closeSearch();
    await vi.waitFor(() => expect(searching(into)).toBe(false));
    sheet.focus();
    key("Enter", { altKey: true });
    await vi.waitFor(() => expect(searching(into)).toBe(true));
  });

  it("uses a key changed in Settings at once: the new key opens Search, the one taken away does nothing", async () => {
    const { into, sheet } = await editing();
    fileItem(into, "Settings…").click();
    const modal = document.querySelector<HTMLDialogElement>('dialog[aria-label="Settings"]')!;
    [...modal.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent!.endsWith("Hotkeys"))!.click();
    modal.querySelector<HTMLButtonElement>('[aria-label="Remove Ctrl + F from Search"]')!.click();
    modal.querySelector<HTMLButtonElement>('[aria-label="Add a key for Search"]')!.click();
    // Recorded, not run: Alt+G is the writer's new key, and nothing opens while it is pressed.
    key("g", { altKey: true });
    expect(searching(into)).toBe(false);
    modal.querySelector<HTMLButtonElement>(".new-project-dialog__actions .dialog-action")!.click();
    expect(inForce.keyBindings["search"]).toEqual([{ key: "Enter", alt: true }, { key: "g", alt: true }]);

    sheet.focus();
    key("f", { ctrlKey: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(searching(into)).toBe(false);
    key("g", { altKey: true });
    await vi.waitFor(() => expect(searching(into)).toBe(true));
  });

  it("answers a key given to an element type, and the surface no longer answers the one taken away", async () => {
    const { into, sheet } = await editing();
    fileItem(into, "Settings…").click();
    const modal = document.querySelector<HTMLDialogElement>('dialog[aria-label="Settings"]')!;
    [...modal.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent!.endsWith("Hotkeys"))!.click();
    modal.querySelector<HTMLButtonElement>('[aria-label="Change Transition: Ctrl + 6"]')!.click();
    key("t", { altKey: true });
    modal.querySelector<HTMLButtonElement>(".new-project-dialog__actions .dialog-action")!.click();
    // The side panel's hint follows.
    const panelRow = [...into.querySelectorAll(".panel__row")].find((row) => row.firstElementChild?.textContent === "Transition")!;
    expect(panelRow.querySelector(".panel__hint")!.textContent).toBe("[Alt + T]");

    sheet.focus();
    // Swallowed: the surface's keymap would have made the line a transition.
    const before = sheet.innerHTML;
    expect(key("6", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(sheet.innerHTML).toBe(before);
  });
});
