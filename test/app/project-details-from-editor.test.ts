/**
 * Edit Project Details from the Editor: File ▸ Edit Project Details… and a
 * click on the name pill open one dialog for the open project — its name, type,
 * target page count and workspaces. A rename changes the project under the
 * paper without taking the paper down; a type changes only the label; the
 * workspaces' tabs follow the switches, and their files are never touched.
 *
 * The real shell and Editor, wired as `main.ts` wires them, over Brick & Steel
 * and one invented project in a temporary folder.
 */
// @vitest-environment jsdom
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "prosemirror-view";
import { suppressNativeMenus } from "../../app/src/menus/native-menu.ts";
import { askToEditProjectDetails, type WorkspaceChoice } from "../../app/src/screens/project-dialogs.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import { DETAILS_FILE, MANUSCRIPT_FILE, MARKER_FILE, type Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { readDetails } from "../../src/project/details.ts";
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
const { notesManifest } = await import("../../app/src/workspaces/notes/notes.ts");
const { planWorkspace } = await import("../../app/src/workspaces/plan/plan.ts");
const WORKSPACES = [editorWorkspace, notesManifest({ spellEngine: fakeEngine() }), planWorkspace];
const CHOICES: readonly WorkspaceChoice[] = WORKSPACES.map(({ id, name, alwaysOn }) => ({ id, name, alwaysOn: alwaysOn === true }));

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
    type: "Feature",
  });
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
});

const reread = vi.fn(async () => {});
/** The fixture's file name, and so the project's. */
const TITLE = "BRICK & STEEL FULL RETIRED";

async function editing() {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  const mount = vi.spyOn(editorWorkspace, "mount");
  const { details } = await readDetails(nodeFilesystem, opened.path);
  shell = mountShell(into, {
    project: opened,
    filesystem: nodeFilesystem,
    workspaces: WORKSPACES,
    shown: details.workspaces,
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    ledger: () => undefined,
    places: () => undefined,
    chooseCopyLocation: async () => undefined,
    openSettings: () => {},
    choosePdfLocation: async () => undefined,
    askToEditDetails: (route) =>
      askToEditProjectDetails(
        { filesystem: nodeFilesystem, projectsDirectory: async () => projects, reread, workspaces: CHOICES },
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
const nameBox = () => dialog()!.querySelector<HTMLInputElement>("#project-details-name")!;
const pagesBox = () => dialog()!.querySelector<HTMLInputElement>("#project-details-pages")!;
const typeField = () => dialog()!.querySelector<HTMLButtonElement>("#project-details-type")!;
const workspaceSwitch = (id: string) => dialog()!.querySelector<HTMLButtonElement>(`#project-details-workspace-${id}`)!;
const contextMenu = () => document.querySelector<HTMLElement>(".drop-menu--context");
const contextItems = () => [...(contextMenu()?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
const tabs = (into: HTMLElement) =>
  [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map((tab) => tab.textContent);
const selectedTab = (into: HTMLElement) =>
  [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;

function fileItem(into: HTMLElement, label: string): HTMLButtonElement {
  const items = [...into.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
  return items.find((item) => item.textContent === label)!;
}

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 400 });
  target.dispatchEvent(event);
  return event;
}

/** File ▸ Edit Project Details…, and wait for it: it reads the project's folder first. */
async function openDetails(into: HTMLElement): Promise<HTMLDialogElement> {
  fileItem(into, "Edit Project Details…").click();
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  return dialog()!;
}

function confirm(): void {
  dialog()!.querySelector("form")!.requestSubmit();
}

function answer(name: string): void {
  nameBox().value = name;
  nameBox().dispatchEvent(new Event("input"));
  confirm();
}

/** Choose a type from the drop-down, as the writer would. */
function chooseType(label: string): void {
  typeField().click();
  const option = [...dialog()!.querySelectorAll<HTMLElement>('[role="option"]')].find((each) => each.textContent === label)!;
  option.click();
}

function typePages(typed: string): void {
  pagesBox().value = typed;
  pagesBox().dispatchEvent(new Event("input"));
  pagesBox().dispatchEvent(new Event("change"));
}

const marker = () => readFileSync(join(opened.path, MARKER_FILE), "utf8");

const folderNames = async () => (await listProjects(nodeFilesystem, projects)).projects.map((p) => p.marker.name).sort();

describe("File ▸ Edit Project Details…, renaming", () => {
  it("opens Edit Project Details, starting from the project's name, in place of Rename Project", async () => {
    const { into } = await editing();
    expect(fileItem(into, "Rename Project…")).toBeUndefined();
    await openDetails(into);
    expect(dialog()!.getAttribute("aria-label")).toBe("Edit Project Details");
    expect(nameBox().value).toBe(TITLE);
    expect(document.activeElement).toBe(nameBox());
  });

  it("opens nothing over a dialog that is already open", async () => {
    const { into } = await editing();
    fileItem(into, "Edit Title Page…").click();
    const open = dialog();
    fileItem(into, "Edit Project Details…").click();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    expect(dialog()).toBe(open);
  });

  it("renames under the paper: the pill, the project and the list follow, and the typing is kept", async () => {
    const { into, pill, sheet, view, mount } = await editing();
    const before = opened;
    view.dispatch(view.state.tr.insertText("Rain. "));
    const caret = view.state.selection.head;
    const doc = view.state.doc;

    await openDetails(into);
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
    await openDetails(into);
    answer("quiet road");
    await vi.waitFor(() => expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull());

    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain("already something called “Quiet Road”");
    expect(pill.textContent).toBe(TITLE);
    expect(opened).toBe(before);
    expect(existsSync(before.path)).toBe(true);
  });

  it("will not confirm an empty name, and Cancel changes nothing", async () => {
    const { into, pill, sheet } = await editing();
    await openDetails(into);
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

describe("the project name pill", () => {
  it("opens Edit Project Details on a plain click, and a rename from it updates the pill", async () => {
    const { pill } = await editing();
    expect(pill.tagName).toBe("BUTTON");
    expect(pill.hasAttribute("title")).toBe(false);
    pill.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()!.getAttribute("aria-label")).toBe("Edit Project Details");
    expect(nameBox().value).toBe(TITLE);

    answer("A/B: Steel");
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(pill.textContent).toBe("A B Steel");

    // And the next one starts from the name it has now.
    pill.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(nameBox().value).toBe("A B Steel");
  });

  it("opens nothing on a right-click: no menu of its own, and not the webview's", async () => {
    const { pill } = await editing();
    // The webview's own menu is the window's to stop, as `main.ts` has it.
    const stop = suppressNativeMenus(window);
    const event = rightClick(pill);
    stop();
    expect(event.defaultPrevented).toBe(true);
    expect(contextMenu()).toBeNull();
    await new Promise((settled) => setTimeout(settled, 20));
    expect(dialog()).toBeNull();
    // Nor do the Menu key and Shift+F10 on it.
    for (const press of [{ key: "ContextMenu" }, { key: "F10", shiftKey: true }]) {
      pill.focus();
      pill.dispatchEvent(new KeyboardEvent("keydown", { ...press, bubbles: true, cancelable: true }));
      expect(contextMenu()).toBeNull();
    }
  });

  it("is a button, so Tab reaches it and Enter or Space opens the dialog, as a click does", async () => {
    const { pill } = await editing();
    pill.focus();
    expect(document.activeElement).toBe(pill);
    // A button's own Enter and Space are its click.
    expect((pill as HTMLButtonElement).type).toBe("button");
  });
});

describe("Edit Project Details: the type", () => {
  it("offers only this surface's types, under the names the app already uses, starting from the project's", async () => {
    const { into } = await editing();
    await openDetails(into);
    expect(typeField().textContent).toBe(opened.marker.format);
    const offered = [...dialog()!.querySelectorAll('[role="option"]')].map((option) => option.textContent);
    expect(offered).toEqual(["Feature", "Episode", "Short Film"]);
  });

  it("changes only the label in project.md: never the target, the workspaces, the name or the script", async () => {
    const { into, pill } = await editing();
    writeFileSync(join(opened.path, DETAILS_FILE), "# Project details\n\nTarget pages: 95\nWorkspaces: editor, plan\n");
    const script = readFileSync(join(opened.path, MANUSCRIPT_FILE));
    const before = opened;
    await openDetails(into);
    chooseType("Short Film");
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());

    expect(marker()).toContain("Format: Short Film");
    expect(marker()).toContain(`Project id: ${before.marker.projectId}`);
    expect(opened.marker.format).toBe("Short Film");
    expect(opened.path).toBe(before.path);
    expect(pill.textContent).toBe(TITLE);
    expect(readFileSync(join(opened.path, DETAILS_FILE), "utf8")).toBe("# Project details\n\nTarget pages: 95\nWorkspaces: editor, plan\n");
    expect(readFileSync(join(opened.path, MANUSCRIPT_FILE))).toEqual(script);
  });
});

describe("Edit Project Details: the target page count", () => {
  it("is blank for a project that has none, and is kept in details.md", async () => {
    const { into } = await editing();
    await openDetails(into);
    expect(pagesBox().value).toBe("");
    typePages("110");
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect((await readDetails(nodeFilesystem, opened.path)).details.targetPages).toBe(110);
    // project.md still holds its four things and no more.
    expect(marker().trim().split("\n").filter((line) => line.includes(":"))).toHaveLength(3);

    await openDetails(into);
    expect(pagesBox().value).toBe("110");
  });

  it("is put right quietly, as Goals puts a number right: never a refusal", async () => {
    const { into } = await editing();
    await openDetails(into);
    for (const [typed, kept] of [["99.6", "100"], ["-4", ""], ["50000", "1000"], ["", ""]] as const) {
      typePages(typed);
      expect(pagesBox().value).toBe(kept);
      expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
    }
    typePages("120");
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect((await readDetails(nodeFilesystem, opened.path)).details.targetPages).toBe(120);
  });
});

describe("Edit Project Details: the workspaces", () => {
  it("draws a switch for each workspace a project may do without, and none for the Editor, which every project has", async () => {
    const { into } = await editing();
    await openDetails(into);
    expect(dialog()!.querySelector("#project-details-workspace-editor")).toBeNull();
    const listed = [...dialog()!.querySelectorAll(".settings__switch label")].map((label) => label.textContent);
    expect(listed).toEqual(["Notes", "Plan"]);
    expect(workspaceSwitch("notes").disabled).toBe(false);
    expect(workspaceSwitch("notes").getAttribute("aria-checked")).toBe("true");
    expect(workspaceSwitch("plan").getAttribute("aria-checked")).toBe("true");
  });

  it("turned off, hides the tab; turned on again, brings it back; the workspace's files are left untouched", async () => {
    const { into } = await editing();
    writeFileSync(join(opened.path, "notes.md"), "# Notes\n\nThe boat is paper.\n");
    expect(tabs(into)).toEqual(["Editor", "Notes", "Plan"]);

    await openDetails(into);
    workspaceSwitch("notes").click();
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(tabs(into)).toEqual(["Editor", "Plan"]);
    expect((await readDetails(nodeFilesystem, opened.path)).details.workspaces).toEqual(["editor", "plan"]);
    expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("# Notes\n\nThe boat is paper.\n");

    await openDetails(into);
    expect(workspaceSwitch("notes").getAttribute("aria-checked")).toBe("false");
    workspaceSwitch("notes").click();
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(tabs(into)).toEqual(["Editor", "Notes", "Plan"]);
    expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("# Notes\n\nThe boat is paper.\n");
  });

  it("turning off the workspace the writer is in returns them to the Editor, whose paper stays up", async () => {
    const { into, sheet, mount } = await editing();
    [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.textContent === "Plan")!.click();
    expect(selectedTab(into)).toBe("Plan");

    await openDetails(into);
    workspaceSwitch("plan").click();
    confirm();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(tabs(into)).toEqual(["Editor", "Notes"]);
    expect(selectedTab(into)).toBe("Editor");
    expect(into.querySelector(".ProseMirror")).toBe(sheet);
    expect(mount).toHaveBeenCalledOnce();
    // Alt+3 asks for a tab that is not there now, and nothing happens.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", altKey: true, bubbles: true, cancelable: true }));
    expect(selectedTab(into)).toBe("Editor");
  });

  it("is shown as the project's details say when the project opens", async () => {
    writeFileSync(join(opened.path, DETAILS_FILE), "# Project details\n\nTarget pages: none\nWorkspaces: editor, notes\n");
    const { into } = await editing();
    expect(tabs(into)).toEqual(["Editor", "Notes"]);
  });
});

describe("Edit Project Details over a project from before it, or with a file it cannot read", () => {
  it("opens a project with no details.md with every workspace on and no target, and writes none until asked", async () => {
    const { into } = await editing();
    expect(existsSync(join(opened.path, DETAILS_FILE))).toBe(false);
    expect(tabs(into)).toEqual(["Editor", "Notes", "Plan"]);
    await openDetails(into);
    expect(pagesBox().value).toBe("");
    answer("Paper Boats");
    await vi.waitFor(() => expect(dialog()).toBeNull());
    // A rename alone writes no details file.
    expect(existsSync(join(opened.path, DETAILS_FILE))).toBe(false);
  });

  it("never writes over a details.md it cannot read, refuses in words, and changes nothing else", async () => {
    const { into, pill } = await editing();
    const unreadable = new Uint8Array([0xff, 0xfe, 0x00, 0x41]);
    writeFileSync(join(opened.path, DETAILS_FILE), unreadable);
    const before = opened;
    await openDetails(into);
    nameBox().value = "Paper Boats";
    typePages("90");
    confirm();
    await vi.waitFor(() => expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull());
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain("details.md could not be read");
    expect(new Uint8Array(readFileSync(join(before.path, DETAILS_FILE)))).toEqual(unreadable);
    expect(opened).toBe(before);
    expect(pill.textContent).toBe(TITLE);
    expect(marker()).toContain(`# ${TITLE}`);
  });
});
