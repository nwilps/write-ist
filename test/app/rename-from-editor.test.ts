/**
 * Renaming the open project from the Editor: File ▸ Rename Project… and the
 * name pill's menu open the Open Project dialog, and a rename changes the
 * project under the paper without taking the paper down.
 *
 * The real shell and Editor, wired as `main.ts` wires them, over Brick & Steel
 * and one invented project in a temporary folder.
 */
// @vitest-environment jsdom
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "prosemirror-view";
import { askToRenameProject } from "../../app/src/screens/project-dialogs.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import { MANUSCRIPT_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { importProject } from "../../src/project/import.ts";
import { listProjects } from "../../src/project/projects.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// The paper's view, which the Editor keeps to itself, so a test can type on it.
const paper = vi.hoisted(() => ({ view: undefined as unknown }));
vi.mock("prosemirror-view", async (actual) => {
  const real = await actual<typeof import("prosemirror-view")>();
  class Kept extends real.EditorView {
    constructor(...args: ConstructorParameters<typeof real.EditorView>) {
      super(...args);
      paper.view = this;
    }
  }
  return { ...real, EditorView: Kept };
});
// The Rust dictionary is not here; the fake stands in for it.
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { editorWorkspace } = await import("../../app/src/workspaces/editor/editor.ts");

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

let temporary: { path: string; remove: () => void };
let projects: string;
let shell: MountedShell | undefined;
/** What `main.ts` calls `opened`. */
let opened: Project;

beforeEach(async () => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  const source = join(temporary.path, "Brick-&-Steel.fountain");
  writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
  const imported = await importProject(
    { filesystem: nodeFilesystem, newProjectId: () => "3f2a1c44-0000-4000-8000-0123456789ab" },
    { sourcePath: source, projectsDirectory: projects },
  );
  opened = imported.project;
  await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-quiet" }, projects, {
    title: "Quiet Road",
    type: "Screenplay",
  });
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
});

const reread = vi.fn(async () => {});
/** What the fixture's title page names it, and so the project. */
const TITLE = "BRICK & STEEL FULL RETIRED";

async function editing() {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  const mount = vi.spyOn(editorWorkspace, "mount");
  shell = mountShell(into, {
    project: opened,
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
    askToRename: (route) =>
      askToRenameProject(
        { filesystem: nodeFilesystem, projectsDirectory: async () => projects, reread },
        opened,
        {
          ...route,
          renamed: (now) => {
            opened = now;
            route.renamed(now);
          },
        },
      ),
  });
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  const pill = into.querySelector<HTMLElement>(".pill--project")!;
  return { into, pill, sheet: into.querySelector(".ProseMirror")!, view: paper.view as EditorView, mount };
}

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
const nameBox = () => dialog()!.querySelector<HTMLInputElement>("input")!;
const contextMenu = () => document.querySelector<HTMLElement>(".drop-menu--context");
const contextItems = () => [...(contextMenu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];

function fileItem(into: HTMLElement, label: string): HTMLButtonElement {
  const items = [...into.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  return items.find((item) => item.textContent === label)!;
}

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 400 });
  target.dispatchEvent(event);
  return event;
}

function answer(name: string): void {
  nameBox().value = name;
  nameBox().dispatchEvent(new Event("input"));
  dialog()!.querySelector("form")!.requestSubmit();
}

const folderNames = async () => (await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name).sort();

describe("File ▸ Rename Project…", () => {
  it("opens the Rename Project dialog, starting from the project's name", async () => {
    const { into } = await editing();
    fileItem(into, "Rename Project…").click();
    expect(dialog()!.getAttribute("aria-label")).toBe("Rename Project");
    expect(nameBox().value).toBe(TITLE);
    expect(document.activeElement).toBe(nameBox());
  });

  it("opens nothing over a dialog that is already open", async () => {
    const { into } = await editing();
    fileItem(into, "Edit Title Page…").click();
    const open = dialog();
    fileItem(into, "Rename Project…").click();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(dialog()).toBe(open);
  });

  it("renames under the paper: the pill, the project and the list follow, and the typing is kept", async () => {
    const { into, pill, sheet, view, mount } = await editing();
    const before = opened;
    view.dispatch(view.state.tr.insertText("Rain. "));
    const caret = view.state.selection.head;
    const doc = view.state.doc;

    fileItem(into, "Rename Project…").click();
    answer("Iron & Glass");
    await vi.waitFor(() => expect(dialog()).toBeNull());

    expect(pill.textContent).toBe("Iron & Glass");
    expect(opened.path).toBe(join(projects, "Iron & Glass"));
    expect(opened.marker.projectId).toBe(before.marker.projectId);
    expect(reread).toHaveBeenCalled();
    expect(await folderNames()).toEqual(["Iron & Glass", "Quiet Road"]);

    // The same paper, as it was: nothing was mounted again.
    expect(mount).toHaveBeenCalledOnce();
    expect(into.querySelector(".ProseMirror")).toBe(sheet);
    expect(view.isDestroyed).toBe(false);
    expect(view.state.doc).toBe(doc);
    expect(view.state.selection.head).toBe(caret);
    expect(document.activeElement).toBe(sheet);

    // Closing saves the typing in the new folder, and nothing goes back to the old.
    expect(await shell!.unmount()).toBe(true);
    shell = undefined;
    expect(readFileSync(join(opened.path, MANUSCRIPT_FILE), "utf8")).toContain("RAIN.");
    expect(existsSync(before.path)).toBe(false);
  });

  it("keeps the dialog up with the reason for a name that is taken, and changes nothing", async () => {
    const { into, pill } = await editing();
    const before = opened;
    fileItem(into, "Rename Project…").click();
    answer("quiet road");
    await vi.waitFor(() => expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull());

    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain("already something called “Quiet Road”");
    expect(pill.textContent).toBe(TITLE);
    expect(opened).toBe(before);
    expect(existsSync(before.path)).toBe(true);
  });

  it("will not confirm an empty name, and Cancel changes nothing", async () => {
    const { into, pill, sheet } = await editing();
    fileItem(into, "Rename Project…").click();
    answer("   ");
    const [cancel, confirm] = [...dialog()!.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")];
    expect(confirm!.disabled).toBe(true);
    expect(dialog()).not.toBeNull();
    expect(pill.textContent).toBe(TITLE);

    cancel!.click();
    expect(dialog()).toBeNull();
    expect(pill.textContent).toBe(TITLE);
    expect(document.activeElement).toBe(sheet);
  });
});

describe("the project name pill's menu", () => {
  it("opens on a right-click with Rename Project alone, in the menus' own look, and no other menu", async () => {
    const { into, pill } = await editing();
    const heard = vi.fn();
    into.addEventListener("contextmenu", heard);
    const event = rightClick(pill);

    expect(event.defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".drop-menu--context")).toHaveLength(1);
    expect(contextItems().map((item) => item.textContent)).toEqual(["Rename Project"]);
    expect(contextItems()[0]!.querySelector("svg.drop-menu__icon")).not.toBeNull();
    expect(pill.hasAttribute("title")).toBe(false);
  });

  it("opens the same dialog, and a rename from it updates the pill", async () => {
    const { pill } = await editing();
    rightClick(pill);
    contextItems()[0]!.click();
    expect(contextMenu()).toBeNull();
    expect(dialog()!.getAttribute("aria-label")).toBe("Rename Project");
    expect(nameBox().value).toBe(TITLE);

    answer("A/B: Steel");
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(pill.textContent).toBe("A B Steel");

    // And the next rename starts from the name it has now.
    rightClick(pill);
    expect(contextMenu()!.getAttribute("aria-label")).toBe("A B Steel");
    contextItems()[0]!.click();
    expect(nameBox().value).toBe("A B Steel");
  });

  it("opens from the keyboard with the item ready, and Escape gives the keys back to the pill", async () => {
    const { pill } = await editing();
    for (const press of [{ key: "ContextMenu" }, { key: "F10", shiftKey: true }]) {
      pill.focus();
      pill.dispatchEvent(new KeyboardEvent("keydown", { ...press, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(contextItems()[0]);
      contextMenu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(contextMenu()).toBeNull();
      expect(document.activeElement).toBe(pill);
    }
  });

  it("gives the keys back to the paper when a right-click's menu is dismissed", async () => {
    const { pill, sheet } = await editing();
    rightClick(pill);
    contextMenu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe(sheet);
  });
});
