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
import { DEFAULT_SETTINGS } from "../../src/settings/settings.ts";
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

/** What `main.ts` does with the request: the real dialog, with ports that hold nothing. */
const openSettings = vi.fn(({ into, closed }: SettingsRequest) => {
  if (document.querySelector("dialog[open]") !== null) return;
  openSettingsDialog(into, {
    settings: () => DEFAULT_SETTINGS,
    change: async () => undefined,
    shortcuts: [],
    dictionary: { words: async () => [], add: async () => true, remove: async () => true },
    graveyard: { list: async () => [], recover: async () => undefined },
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
    askToRename: () => {},
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
