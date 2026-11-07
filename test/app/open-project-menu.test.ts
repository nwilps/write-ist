/**
 * The Open Project screen's right-click menu, and the two dialogs it opens:
 * a menu only on a project row, for the project right-clicked, with Rename
 * Project and Delete Project — and Delete a move to `Deleted Projects`.
 *
 * Every project here is made up, in a temporary folder.
 */
// @vitest-environment jsdom
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderOpenProject, type OpenProjectScreen } from "../../app/src/screens/open-project.ts";
import { showDeleteProject, showRenameProject } from "../../app/src/screens/project-dialogs.ts";
import { answerKey, type KeyPress } from "../../app/src/screens/shortcuts.ts";
import { createProject } from "../../src/project/create.ts";
import { deleteProject, deletedFolderIn } from "../../src/project/delete.ts";
import { renameProject } from "../../src/project/rename.ts";
import { listProjects, type ProjectsListing } from "../../src/project/projects.ts";
import type { Project } from "../../src/project/bundle.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";

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
afterEach(() => document.body.replaceChildren());

const project = (name: string): Project => ({
  path: `/projects/${name}`,
  marker: { name, formatVersion: "1", projectId: `id-${name}`, format: "Feature" },
});
const listing = (...names: string[]): ProjectsListing => ({ projects: names.map(project), unreadable: [] });

const press = (key: string): KeyPress => ({ key, altKey: false, ctrlKey: false, metaKey: false });

function draw(overrides: Partial<OpenProjectScreen> = {}) {
  const into = document.createElement("div");
  document.body.replaceChildren(into);
  const calls = {
    onOpen: vi.fn(),
    onBack: vi.fn(),
    onNewProject: vi.fn(),
    onSearch: vi.fn(),
    onImport: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  const drawn = renderOpenProject(into, {
    listing: listing("Paper Boats", "Quiet Road", "Untitled Short"),
    importing: false,
    ...calls,
    ...overrides,
  });
  const rows = [...into.querySelectorAll<HTMLButtonElement>("button.project")];
  const lit = () => rows.flatMap((r, i) => (r.classList.contains("gesture--selected") ? [i] : []));
  const key = (p: KeyPress) =>
    answerKey(p, { dialogOpen: document.querySelector("dialog[open]") !== null, gestures: drawn.gestures, navigate: drawn.navigate });
  return { into, calls, drawn, rows, lit, key };
}

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
  target.dispatchEvent(event);
  return event;
}

const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const items = () => [...(menu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
const choose = (label: string) => items().find((item) => item.textContent === label)!.click();

describe("the right-click menu on Open Project", () => {
  it("opens on a project row, with exactly Rename Project and Delete Project, in the menus' own look", () => {
    const { rows } = draw();
    const event = rightClick(rows[1]!);

    expect(event.defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(menu()!.classList.contains("drop-menu")).toBe(true);
    expect(menu()!.classList.contains("drop-menu--context")).toBe(true);
    expect(items().map((item) => item.textContent)).toEqual(["Rename Project", "Delete Project"]);
    expect(items().every((item) => item.querySelector("svg.drop-menu__icon") !== null)).toBe(true);
  });

  it("opens nothing on blank space — the header, the rules, the foot, the screen — and no webview menu either", () => {
    const { into } = draw();
    for (const blank of [
      into.querySelector("main")!,
      into.querySelector(".open-project__header")!,
      into.querySelector(".open-project-rule")!,
      into.querySelector(".projects")!,
      into.querySelector(".menu--foot")!,
      into.querySelector(".menu--foot .gesture")!,
    ]) {
      expect(rightClick(blank).defaultPrevented).toBe(true);
      expect(menu()).toBeNull();
    }
  });

  it("acts on the row right-clicked, not the one lit before", () => {
    const { rows, calls, lit, key } = draw();
    key(press("ArrowDown"));
    expect(lit()).toEqual([1]);

    rightClick(rows[2]!);
    choose("Rename Project");
    expect(calls.onRename).toHaveBeenCalledExactlyOnceWith(project("Untitled Short"));

    rightClick(rows[0]!);
    choose("Delete Project");
    expect(calls.onDelete).toHaveBeenCalledExactlyOnceWith(project("Paper Boats"));
    expect(calls.onOpen).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
  });

  it("lights the row right-clicked, and keeps one light on it while the menu is open", () => {
    const { rows, lit } = draw();
    rightClick(rows[2]!);
    expect(lit()).toEqual([2]);

    // The pointer crossing another row on its way to the menu does not move it.
    rows[0]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(lit()).toEqual([2]);

    menu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu()).toBeNull();
    rows[0]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(lit()).toEqual([0]);
  });

  it("closes on Escape without leaving the screen, and the screen's letters wait while it is open", () => {
    const { rows, calls, key } = draw();
    rightClick(rows[0]!);

    // Escape that reached the window rather than the menu still only closes the menu.
    expect(key(press("Escape"))).toBe(true);
    expect(menu()).toBeNull();
    expect(calls.onBack).not.toHaveBeenCalled();
    rightClick(rows[0]!);

    expect(key(press("n"))).toBe(true);
    expect(key(press("i"))).toBe(true);
    expect(calls.onNewProject).not.toHaveBeenCalled();
    expect(calls.onImport).not.toHaveBeenCalled();
    // Enter belongs to the menu's focused item, not the lit row.
    expect(key(press("Enter"))).toBe(false);
    expect(calls.onOpen).not.toHaveBeenCalled();

    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    menu()!.dispatchEvent(escape);
    window.removeEventListener("keydown", heard);
    expect(heard).not.toHaveBeenCalled();
    expect(calls.onBack).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(rows[0]);
  });

  it("opens from the keyboard on the lit row: the Menu key, and Shift+F10, with the first item ready", () => {
    const { rows, calls, key, lit } = draw();
    key(press("ArrowDown"));
    key(press("ContextMenu"));
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
    expect(lit()).toEqual([1]);
    menu()!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    (document.activeElement as HTMLButtonElement).click();
    expect(calls.onDelete).toHaveBeenCalledExactlyOnceWith(project("Quiet Road"));

    rows[2]!.focus();
    rows[2]!.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
    expect(menu()).not.toBeNull();
    (document.activeElement as HTMLButtonElement).click();
    expect(calls.onRename).toHaveBeenCalledExactlyOnceWith(project("Untitled Short"));
  });

  it("is taken down when the screen is drawn again", () => {
    const { rows } = draw();
    rightClick(rows[0]!);
    draw();
    expect(menu()).toBeNull();
  });
});

describe("the Rename Project dialog", () => {
  const open = (onRename = vi.fn<(name: string) => Promise<string | undefined>>(async () => undefined)) => {
    const onClose = vi.fn();
    const modal = showRenameProject(document.body, { project: project("Paper Boats"), onRename, onClose });
    const input = modal.querySelector<HTMLInputElement>("input")!;
    const [cancel, confirm] = [...modal.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")];
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    const enter = () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    return { modal, input, cancel: cancel!, confirm: confirm!, type, enter, onRename, onClose };
  };

  it("is the New Project dialog's look, named for a screen reader, starting from the name it has", () => {
    const { modal, input, cancel, confirm } = open();
    expect(modal.classList.contains("new-project-dialog")).toBe(true);
    expect(modal.getAttribute("aria-label")).toBe("Rename Project");
    expect(modal.querySelector("label")!.textContent).toBe("Project name");
    expect(modal.querySelector("label")!.htmlFor).toBe(input.id);
    expect(input.value).toBe("Paper Boats");
    expect(document.activeElement).toBe(input);
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(confirm.textContent).toBe(">Confirm[Enter]");
  });

  it("keeps Confirm off for an empty name and for the same name", () => {
    const { type, confirm, enter, onRename } = open();
    expect(confirm.disabled).toBe(true);
    type("   ");
    expect(confirm.disabled).toBe(true);
    enter();
    expect(onRename).not.toHaveBeenCalled();
    type("Paper Planes");
    expect(confirm.disabled).toBe(false);
  });

  it("renames on Enter and closes", async () => {
    const { type, enter, onRename, onClose, modal } = open();
    type("Paper Planes");
    enter();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onRename).toHaveBeenCalledExactlyOnceWith("Paper Planes");
    expect(modal.isConnected).toBe(false);
  });

  it("says a refusal inside the dialog and stays open, so the name can be changed", async () => {
    const { type, enter, modal, onClose } = open(vi.fn(async () => "There is already something called “Quiet Road”."));
    type("Quiet Road");
    enter();
    await vi.waitFor(() => expect(modal.querySelector('[role="alert"]')).not.toBeNull());
    expect(modal.querySelector('[role="alert"]')!.textContent).toContain("Quiet Road");
    expect(modal.hasAttribute("open")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels with Cancel, renaming nothing", () => {
    const { cancel, onRename, onClose } = open();
    cancel.click();
    expect(onRename).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the Delete Project dialog", () => {
  const open = (onDelete = vi.fn<() => Promise<string | undefined>>(async () => undefined)) => {
    const onClose = vi.fn();
    const deletedFolder = "/home/writer/Documents/write-ist/Deleted Projects";
    const modal = showDeleteProject(document.body, { project: project("Paper Boats"), deletedFolder, onDelete, onClose });
    const [cancel, confirm] = [...modal.querySelectorAll<HTMLButtonElement>(".new-project-dialog__action")];
    return { modal, cancel: cancel!, confirm: confirm!, onDelete, onClose, deletedFolder };
  };

  it("says plainly that the project is moved to the deleted folder, names it, and is not deleted for good", () => {
    const { modal, deletedFolder, confirm, cancel } = open();
    const text = modal.textContent!;
    expect(modal.getAttribute("aria-label")).toBe("Delete Project");
    expect(text).toContain("“Paper Boats”");
    expect(text).toContain("not deleted for good");
    expect(text).toContain("moved");
    expect(modal.querySelector(".project-dialog__path")!.textContent).toBe(deletedFolder);
    expect(text).toContain("move its folder from there back");
    expect(cancel.textContent).toBe(">Cancel[Esc]");
    expect(confirm.textContent).toBe(">Delete[Enter]");
  });

  it("moves nothing until Delete is chosen, and nothing when cancelled", () => {
    const { cancel, onDelete, onClose } = open();
    expect(onDelete).not.toHaveBeenCalled();
    cancel.click();
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open with the reason when the move was refused", async () => {
    const { confirm, modal } = open(vi.fn(async () => "“Paper Boats” could not be moved, so it is where it was."));
    confirm.click();
    await vi.waitFor(() => expect(modal.querySelector('[role="alert"]')).not.toBeNull());
    expect(modal.hasAttribute("open")).toBe(true);
  });
});

describe("the menu, end to end, on real projects in a temporary folder", () => {
  it("deletes the project right-clicked into Deleted Projects, and renames the one right-clicked", async () => {
    const temporary = temporaryDirectory();
    try {
      const folder = join(temporary.path, "write-ist");
      let minted = 0;
      for (const title of ["Paper Boats", "Quiet Road", "Untitled Short"]) {
        await createProject({ filesystem: nodeFilesystem, newProjectId: () => `id-${++minted}` }, folder, {
          title,
          type: "Screenplay",
        });
      }
      let real = await listProjects(nodeFilesystem, folder);

      // As `main.ts` wires it: the menu's project goes to the dialog, and the dialog to the disk.
      const onDelete = (chosen: Project) =>
        void showDeleteProject(document.body, {
          project: chosen,
          deletedFolder: deletedFolderIn(folder),
          onDelete: async () => void (await deleteProject(nodeFilesystem, folder, chosen)),
          onClose: () => {},
        });
      let drawn = draw({ listing: real, onDelete });
      rightClick(drawn.rows[1]!);
      choose("Delete Project");
      const modal = document.querySelector<HTMLDialogElement>("dialog[open]")!;
      modal.querySelector<HTMLButtonElement>(".new-project-dialog__action--confirm")!.click();
      await vi.waitFor(() => expect(modal.isConnected).toBe(false));

      real = await listProjects(nodeFilesystem, folder);
      expect(real.projects.map((p) => p.marker.name)).toEqual(["Paper Boats", "Untitled Short"]);
      expect(readdirSync(deletedFolderIn(folder))).toEqual(["Quiet Road"]);

      const onRename = (chosen: Project) =>
        void showRenameProject(document.body, {
          project: chosen,
          onRename: async (name) => void (await renameProject(nodeFilesystem, folder, chosen, name)),
          onClose: () => {},
        });
      drawn = draw({ listing: real, onRename });
      rightClick(drawn.rows[1]!);
      choose("Rename Project");
      const rename = document.querySelector<HTMLDialogElement>("dialog[open]")!;
      const input = rename.querySelector("input")!;
      input.value = "Short Story";
      input.dispatchEvent(new Event("input"));
      rename.querySelector<HTMLButtonElement>(".new-project-dialog__action--confirm")!.click();
      await vi.waitFor(() => expect(rename.isConnected).toBe(false));

      real = await listProjects(nodeFilesystem, folder);
      expect(real.projects.map((p) => p.marker.name)).toEqual(["Paper Boats", "Short Story"]);
      expect(real.projects[1]!.marker.projectId).toBe("id-3");
    } finally {
      temporary.remove();
    }
  });
});
