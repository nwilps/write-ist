/**
 * The toolbox (ADR-0045), proved the way a Lego brick is: by taking pieces off
 * and putting a new one on.
 *
 * - **The only door.** Notes, Plan, the starter template and the test-only
 *   Sketch import nothing of the application's but the toolbox's public
 *   module, and use its grouped calls, never the earlier, unscoped ones. The
 *   registry is a plain list of manifests.
 * - **Unplugged.** With Notes and Plan taken out of the list — in the test,
 *   not the source — the application still opens a project, the Hotkeys lists
 *   no longer name them, and Settings, New Project Defaults and Edit Project
 *   Details still work, offering what is left.
 * - **Plugged in.** Sketch (`test/support/sketch-workspace.ts`), registered
 *   only here, uses one of every kind of call end to end: its files read,
 *   autosaved and saved on leaving, its place remembered, a pill, a hotkey that
 *   is listed and answered, its own menu, the destructive confirm, the shared
 *   dictionary, and settings drawn in all three places.
 *
 * Real files in a temporary folder, through the same port the application
 * uses, and an invented project. No corpus.
 */
// @vitest-environment jsdom
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { askToEditProjectDetails, type WorkspaceChoice } from "../../app/src/screens/project-dialogs.ts";
import { openSettingsDialog } from "../../app/src/screens/settings.ts";
import { addedGroups, offerWorkspaces } from "../../app/src/shell/hotkeys.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import { TOOLBOX_VERSION, type WorkspaceManifest } from "../../app/src/shell/workspace.ts";
import type { Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { readDetails } from "../../src/project/details.ts";
import { openWorkspacePlaces, type WorkspacePlaces } from "../../src/project/workspace-places.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/settings/settings.ts";
import type { WorkspaceSettingValues } from "../../src/settings/workspace-settings.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";
import { SKETCH_FILE, SKETCH_FOLDER, sketchWorkspace } from "../support/sketch-workspace.ts";

vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { WORKSPACES } = await import("../../app/src/workspaces/registry.ts");
const { alsoTaken } = await import("../../app/src/shell/hotkeys.ts");
const { RESERVED_KEYS, shortcutCommands, takenKeys } = await import("../../app/src/workspaces/editor/commands.ts");
const { shortcutGroups } = await import("../../app/src/workspaces/editor/keyboard-shortcuts-dialog.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = join(root, "app", "src");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  // As `main.ts` does at launch: a workspace's key is never one the Editor's commands have.
  alsoTaken(takenKeys);
});

// --- The only door ------------------------------------------------------------

/** The code, with the comments taken out. */
const codeOf = (path: string): string =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : /\.ts$/.test(name) ? [path] : [];
  });
}

/** Every relative import a file makes, resolved. */
const importsOf = (path: string): string[] =>
  [...codeOf(path).matchAll(/(?:from|import)\s+"(\.[^"]+)"/g)].map((match) => resolve(dirname(path), match[1]!));

/** The workspaces held to the rule: Notes, Plan, the template, and Sketch. */
const HELD = [
  ...["notes", "plan", "_template"].flatMap((folder) => filesIn(join(APP, "workspaces", folder))),
  join(root, "test", "support", "sketch-workspace.ts"),
];
const TOOLBOX = join(APP, "toolbox", "index.ts");

describe("the toolbox is the only door (ADR-0045)", () => {
  it("is what Notes, Plan, the template and Sketch import of the application, and nothing else", () => {
    expect(HELD.length).toBeGreaterThan(3);
    for (const file of HELD) {
      const own = dirname(file);
      const reaches = importsOf(file).filter((target) => target.startsWith(APP) && target !== TOOLBOX && !target.startsWith(own));
      expect(reaches.map((target) => relative(root, target)), relative(root, file)).toEqual([]);
      expect(importsOf(file), relative(root, file)).toContain(TOOLBOX);
    }
  });

  it("is used by its grouped calls, never the earlier ones that reach the whole disk or every workspace", () => {
    const earlier = /\b(?:toolbox|context)\.(?:filesystem|workspacePlaces|places|setStatus|setGoal|setSaved|setSpellcheck|whenSwitchedAway|whenSwitchedBack|whenGoalsAsked|whenDetailsAsked|whenDetailsChanged|editProjectDetails|openSettings)\b/;
    for (const file of HELD) expect(codeOf(file), relative(root, file)).not.toMatch(earlier);
    // The shell's own files are not workspaces, and the Editor keeps its path for now: neither is held here.
    expect(HELD.some((file) => file.includes("editor"))).toBe(false);
  });

  it("makes the registry a plain list of manifests, with neither the template nor Sketch in it", () => {
    const registry = codeOf(join(APP, "workspaces", "registry.ts"));
    const list = /WORKSPACES[^=]*=\s*\[([^\]]*)\]/.exec(registry)![1]!;
    expect(list).not.toContain("(");
    expect(registry).not.toMatch(/spell-tauri|_template/);
    expect(WORKSPACES.map((workspace) => workspace.id)).not.toContain("template");
    expect(WORKSPACES.map((workspace) => workspace.id)).not.toContain("sketch");
  });

  it("is version 1, and says so on every toolbox", async () => {
    expect(TOOLBOX_VERSION).toBe(1);
    const { manifest, probe } = sketchWorkspace();
    await openProject([...WORKSPACES, manifest]);
    alt(manifest.key);
    await probe.ready;
    expect(probe.toolbox!.version).toBe(TOOLBOX_VERSION);
    expect(probe.toolbox!.workspace).toEqual({ id: "sketch", name: "Sketch" });
  });
});

// --- A project, opened in the shell as `main.ts` opens one ----------------------

let temporary: { path: string; remove: () => void };
let projects: string;
let opened: Project;
let places: WorkspacePlaces;
let shell: MountedShell | undefined;
/** The writer's settings, as `main.ts` keeps them, and who is told when they change. */
let settings: Settings;
const settingsChanged = new Set<() => void>();

beforeEach(async () => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  opened = await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-paper-boats" }, projects, {
    title: "Paper Boats",
    type: "Feature",
  });
  places = openWorkspacePlaces(nodeFilesystem, join(temporary.path, "app-data"));
  settings = DEFAULT_SETTINGS;
  settingsChanged.clear();
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
  offerWorkspaces(WORKSPACES);
});

const choicesOf = (workspaces: readonly WorkspaceManifest[]): WorkspaceChoice[] =>
  workspaces.map(({ id, name, alwaysOn, settings: own }) => ({ id, name, alwaysOn: alwaysOn === true, ...(own === undefined ? {} : { settings: own }) }));

async function openProject(workspaces: readonly WorkspaceManifest[]): Promise<HTMLElement> {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
  const { details } = await readDetails(nodeFilesystem, opened.path);
  shell = mountShell(into, {
    project: opened,
    filesystem: nodeFilesystem,
    workspaces,
    shown: details.workspaces,
    onClose: () => {},
    onHome: () => {},
    whenSwitchedAway: quiet,
    whenSwitchedBack: quiet,
    ledger: () => undefined,
    places: () => undefined,
    workspacePlaces: () => places,
    spellEngine: fakeEngine(),
    workspaceSettings: () => settings.workspaceSettings,
    whenSettingsChanged: (act) => {
      settingsChanged.add(act);
      return () => void settingsChanged.delete(act);
    },
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    openSettings: () => {},
    askToEditDetails: (route) =>
      askToEditProjectDetails(
        { filesystem: nodeFilesystem, projectsDirectory: async () => projects, reread: async () => {}, workspaces: choicesOf(workspaces) },
        opened,
        { ...route, renamed: (now) => ((opened = now), route.renamed(now)) },
      ),
  });
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  return into;
}

/** Settings, as `main.ts` opens it: a change is used at once, and whoever listens is told. */
function openSettings(workspaces: readonly WorkspaceManifest[]): HTMLDialogElement {
  return openSettingsDialog(document.body, {
    settings: () => settings,
    change: async (next) => {
      settings = next;
      for (const told of settingsChanged) told();
      return undefined;
    },
    shortcuts: { commands: shortcutCommands(), reserved: RESERVED_KEYS },
    dictionary: { words: async () => [], add: async () => true, remove: async () => true },
    graveyard: { list: async () => [], recover: async () => undefined, exile: async () => undefined },
    workspaces: choicesOf(workspaces),
    closed: () => {},
  });
}

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
const tabNames = (into: HTMLElement) => [...into.querySelectorAll(".workspace-bar__tab")].map((tab) => tab.textContent);
const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
};
const alt = (key: string) => press(key, { altKey: true });
const viewRows = () => shortcutGroups().find((group) => group.name === "View")!.rows.map((row) => `${row.label} ${row.hints.join("")}`);
const switchNamed = (scope: ParentNode, label: string) => {
  const found = [...scope.querySelectorAll<HTMLLabelElement>("label")].find((each) => each.textContent === label);
  return found === undefined ? undefined : scope.querySelector<HTMLButtonElement>(`#${CSS.escape(found.htmlFor)}`) ?? undefined;
};

// --- Unplugged -------------------------------------------------------------------

describe("unplugged: Notes and Plan taken out of the list", () => {
  const editorOnly = () => WORKSPACES.filter((workspace) => workspace.alwaysOn === true);

  it("still opens a project, in the Editor, with one tab, and Alt and a missing tab's key asks for nothing", async () => {
    const into = await openProject(editorOnly());
    expect(tabNames(into)).toEqual(["Editor"]);
    for (const workspace of WORKSPACES.filter((each) => each.alwaysOn !== true)) {
      expect(alt(workspace.key).defaultPrevented, workspace.name).toBe(false);
    }
    expect(tabNames(into)).toEqual(["Editor"]);
  });

  it("lists in both Hotkeys lists only the tabs that are left", async () => {
    await openProject(editorOnly());
    const gone = WORKSPACES.filter((each) => each.alwaysOn !== true);
    expect(gone.length).toBeGreaterThan(0);
    expect(viewRows()).toContain("Editor [Alt + 1]");
    for (const workspace of gone) {
      expect(viewRows().join("\n")).not.toContain(workspace.name);
      expect(shortcutCommands().map((command) => command.id)).not.toContain(`workspace-${workspace.id}`);
    }
    // Put back, they are listed again, with no line written anywhere.
    offerWorkspaces(WORKSPACES);
    for (const workspace of gone) expect(viewRows()).toContain(`${workspace.name} [Alt + ${workspace.key}]`);
  });

  it("still opens Settings and New Project Defaults, which offer only what is left, and still keeps a change", async () => {
    await openProject(editorOnly());
    const modal = openSettings(editorOnly());
    // No workspace may be switched off for a new project when the Editor is all there is.
    expect(modal.textContent).not.toContain("Workspaces");
    modal.querySelector<HTMLButtonElement>("#settings-defaults-feature-head")!.click();
    for (const workspace of WORKSPACES.filter((each) => each.alwaysOn !== true)) {
      expect(modal.querySelector(`#settings-defaults-feature-workspace-${workspace.id}`)).toBeNull();
    }
    switchNamed(modal, "White paper")!.click();
    expect(settings.appearance.whitePaper).toBe(true);
    modal.close();
  });

  it("still edits the project's details, with no workspace to switch", async () => {
    const into = await openProject(editorOnly());
    into.querySelector<HTMLElement>(".pill--project")!.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()!.querySelector('[id^="project-details-workspace-"]')).toBeNull();
    const pages = dialog()!.querySelector<HTMLInputElement>("#project-details-pages")!;
    pages.value = "95";
    pages.dispatchEvent(new Event("input", { bubbles: true }));
    dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect((await readDetails(nodeFilesystem, opened.path)).details.targetPages).toBe(95);
  });
});

// --- Plugged in: Sketch ------------------------------------------------------------

describe("Sketch, a workspace registered only in this test, through its toolbox alone", () => {
  const sketchFile = () => join(opened.path, SKETCH_FILE);
  const sketches = () => join(opened.path, SKETCH_FOLDER);
  const box = (into: HTMLElement) => into.querySelector<HTMLTextAreaElement>(".sketch__text")!;
  const type = (into: HTMLElement, text: string) => {
    box(into).value = text;
    box(into).dispatchEvent(new Event("input", { bubbles: true }));
  };
  const savePill = (into: HTMLElement) => into.querySelector<HTMLElement>(".pill--save")!.dataset["state"];
  const counts = (into: HTMLElement) => into.querySelector<HTMLElement>(".pill--counts")!;

  async function withSketch() {
    writeFileSync(sketchFile(), "The ferry at night");
    const sketch = sketchWorkspace();
    const into = await openProject([...WORKSPACES, sketch.manifest]);
    alt(sketch.manifest.key);
    await sketch.probe.ready;
    return { into, ...sketch };
  }

  it("reads its file, counts its words in the pill, and saves on leaving — never before it was read", async () => {
    const { into, probe } = await withSketch();
    expect(tabNames(into)).toEqual([...WORKSPACES.map((workspace) => workspace.name), "Sketch"]);
    expect(box(into).value).toBe("The ferry at night");
    expect(counts(into).textContent).toBe("4 words");
    type(into, "The ferry crosses at night");
    expect(savePill(into)).toBe("unsaved");
    expect(counts(into).textContent).toBe("5 words");
    // Leaving for another workspace saves (ADR-0028); the save itself is awaited, not a guess at its length.
    alt("1");
    await probe.file!.settled();
    expect(readFileSync(sketchFile(), "utf8")).toBe("The ferry crosses at night");
    alt("4");
    await vi.waitFor(() => expect(savePill(into)).toBe("saved"));
  });

  it("autosaves after the writer stops, through the same safe save", async () => {
    const { into, probe } = await withSketch();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      type(into, "Autosaved.");
      await vi.advanceTimersByTimeAsync(2_500);
    } finally {
      vi.useRealTimers();
    }
    await probe.file!.settled();
    expect(readFileSync(sketchFile(), "utf8")).toBe("Autosaved.");
  });

  it("remembers the caret in app data, and puts it back when the project opens again", async () => {
    const { into } = await withSketch();
    box(into).setSelectionRange(9, 9);
    expect(await shell!.unmount()).toBe(true);
    shell = undefined;
    document.body.replaceChildren();
    expect(await places.recall("id-paper-boats", "sketch")).toEqual({ caret: 9 });
    expect(existsSync(join(opened.path, "workspace-places.txt"))).toBe(false);

    const again = sketchWorkspace();
    const reopened = await openProject([...WORKSPACES, again.manifest]);
    alt("4");
    await again.probe.ready;
    expect(box(reopened).selectionStart).toBe(9);
  });

  it("adds a hotkey, listed under its name in both Hotkeys lists and answered only while it is on screen", async () => {
    const { into, probe } = await withSketch();
    expect(probe.added).toBe(true);
    // The Editor's own Add Comment is listed too, under its name, first as its tab is.
    expect(addedGroups().map((group) => group.id)).toEqual(["editor", "sketch"]);
    expect(addedGroups().find((group) => group.id === "sketch")).toEqual({ id: "sketch", name: "Sketch", rows: [{ id: "tidy", label: "Tidy Sketch", chord: { key: "j", mod: true } }] });
    expect(shortcutGroups().find((group) => group.name === "Sketch")?.rows).toEqual([{ label: "Tidy Sketch", hints: ["[Ctrl + J]"] }]);
    expect(shortcutCommands().find((command) => command.id === "sketch-tidy")).toMatchObject({ label: "Tidy Sketch (Sketch)", fixed: true });

    expect(press("j", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(probe.tidied).toBe(1);
    // Not while a dialog is open, and not from behind another workspace.
    alt("1");
    expect(press("j", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(probe.tidied).toBe(1);
    expect(tabNames(into)).toContain("Sketch");
  });

  it("is refused a key someone already has, or one that is only typing — quietly", async () => {
    const { probe } = await withSketch();
    const add = (chord: { key: string; mod?: true; alt?: true }) =>
      probe.toolbox!.hotkeys.add({ id: `try-${chord.key}`, label: "Try", chord, act: () => {} });
    expect(add({ key: "1", alt: true })).toBeUndefined(); // the Editor's tab
    expect(add({ key: "ArrowLeft", alt: true })).toBeUndefined(); // Previous Workspace
    expect(add({ key: "k", mod: true })).toBeUndefined(); // the Editor's Hotkeys
    expect(add({ key: "b", mod: true })).toBeUndefined(); // the surface's Bold
    expect(add({ key: "m", mod: true })).toBeUndefined(); // the Editor's Add Comment, added through its own toolbox
    expect(add({ key: "j", mod: true })).toBeUndefined(); // its own Tidy
    expect(add({ key: "q" })).toBeUndefined(); // a bare letter is typing
    expect(add({ key: "q", mod: true, alt: true })).toBeUndefined(); // AltGr's
    expect(document.querySelector(".trouble")).toBeNull();
    const taken = add({ key: "F9" });
    expect(taken).toBeTypeOf("function");
    taken!();
    expect(addedGroups().find((group) => group.id === "sketch")!.rows.map((row) => row.id)).toEqual(["tidy"]);
  });

  it("opens Write-ist's own menu, and deletes a sketch only after the destructive confirm, in its own words", async () => {
    const { into } = await withSketch();
    mkdirSync(sketches());
    writeFileSync(join(sketches(), "Dock.md"), "Gone soon.");
    writeFileSync(join(sketches(), "Gulls.md"), "Stays.");
    const menu = async () => {
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
      box(into).dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
      return [...document.querySelectorAll<HTMLElement>('.drop-menu--context [role="menuitem"]')];
    };
    const rows = await menu();
    expect(rows.map((row) => row.textContent)).toEqual(["Check Spelling", "Dock.md", "Gulls.md"]);
    const deleteDock = rows[1]!.querySelector<HTMLElement>(".drop-menu__aside")!;
    expect(deleteDock.classList.contains("drop-menu__aside--alarm")).toBe(true);
    deleteDock.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    expect(dialog()!.getAttribute("aria-label")).toBe("Delete Sketch");
    expect(dialog()!.classList.contains("project-dialog--alarm")).toBe(true);
    expect(dialog()!.textContent).toContain('Delete "Dock.md"?');
    expect(dialog()!.textContent).toContain("This permanently deletes the sketch.");
    // Cancel is where the writer's hand is.
    expect(document.activeElement?.textContent).toContain("Cancel");
    dialog()!.close();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(readdirSync(sketches()).sort()).toEqual(["Dock.md", "Gulls.md"]);

    (await menu())[1]!.querySelector<HTMLElement>(".drop-menu__aside")!.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(readdirSync(sketches())).toEqual(["Gulls.md"]);
    expect(readFileSync(sketchFile(), "utf8")).toBe("The ferry at night");
  });

  it("reaches only the files it declared: nothing else in the project, nothing outside it, nothing written over", async () => {
    const { probe } = await withSketch();
    const files = probe.toolbox!.files;
    mkdirSync(sketches());
    writeFileSync(join(sketches(), "Dock.md"), "Mine.");
    await expect(files.read("manuscript.fountain")).rejects.toThrow(/not one of this workspace's files/);
    await expect(files.read("plan.md")).rejects.toThrow();
    await expect(files.read("../outside.md")).rejects.toThrow();
    await expect(files.read("sketches/../project.md")).rejects.toThrow();
    await expect(files.read("sketches/deeper/a.md")).rejects.toThrow();
    await expect(files.list("notes")).rejects.toThrow();
    // Delete is for a file in a declared folder, never its declared top-level file.
    await expect(files.remove(SKETCH_FILE)).rejects.toThrow();
    await expect(files.remove("project.md")).rejects.toThrow();
    // Make and move never write over anything.
    await expect(files.create("sketches/Dock.md", "Over it.")).rejects.toThrow();
    await files.create("sketches/Gulls.md", "New.");
    await expect(files.move("sketches/Gulls.md", "sketches/Dock.md")).rejects.toThrow();
    expect(readFileSync(join(sketches(), "Dock.md"), "utf8")).toBe("Mine.");
    expect(readFileSync(join(sketches(), "Gulls.md"), "utf8")).toBe("New.");
    expect(existsSync(join(opened.path, "manuscript.fountain"))).toBe(true);
  });

  it("checks spelling with the dictionary the Editor uses", async () => {
    const { into, probe } = await withSketch();
    expect(probe.toolbox!.spelling.available).toBe(true);
    type(into, "the ferry crosses at nihgt");
    box(into).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
    [...document.querySelectorAll<HTMLElement>('.drop-menu--context [role="menuitem"]')].find((row) => row.textContent === "Check Spelling")!.click();
    await vi.waitFor(() => expect(probe.misspelt.map((found) => found.word)).toContain("nihgt"));
    expect(probe.misspelt.map((found) => found.word)).not.toContain("night");
    expect(await probe.toolbox!.spelling.suggest("nihgt")).toContain("night");
  });

  it("draws its settings where the application draws its own, and reads them back as the writer sets them", async () => {
    const { into, probe } = await withSketch();
    const { manifest } = sketchWorkspace();
    await vi.waitFor(() => expect(probe.wrap).toBe(true));
    expect(probe.guides).toBe(false);

    // Settings ▸ General: the application-wide one, under the workspace's name.
    const modal = openSettings([...WORKSPACES, manifest]);
    expect([...modal.querySelectorAll(".settings__subheading")].map((each) => each.textContent)).toContain("Sketch");
    switchNamed(modal, "Wrap Lines")!.click();
    expect(settings.workspaceSettings).toEqual({ sketch: { wrap: false } } satisfies WorkspaceSettingValues);
    await vi.waitFor(() => expect(probe.wrap).toBe(false));
    // Settings ▸ New Project Defaults: the per-project one, for each type.
    modal.querySelector<HTMLButtonElement>("#settings-defaults-feature-head")!.click();
    const startsWith = modal.querySelector<HTMLButtonElement>("#settings-defaults-feature-setting-sketch-guides")!;
    expect(startsWith).not.toBeNull();
    startsWith.click();
    expect(settings.projectDefaults["Feature"]!.workspaceSettings).toEqual({ sketch: { guides: true } });
    modal.close();

    // Edit Project Details: the per-project one, kept in details.md.
    into.querySelector<HTMLElement>(".pill--project")!.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    switchNamed(dialog()!, "Show Guides")!.click();
    dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(readFileSync(join(opened.path, "details.md"), "utf8")).toContain("Setting sketch.guides: yes");
    await vi.waitFor(() => expect(probe.guides).toBe(true));

    // And New Project starts a project with the defaults the writer set.
    const made = await createProject(
      { filesystem: nodeFilesystem, newProjectId: () => "id-gulls" },
      projects,
      { title: "Gulls", type: "Feature" },
      settings.projectDefaults["Feature"]!,
    );
    expect((await readDetails(nodeFilesystem, made.path)).details.workspaceSettings).toEqual({ sketch: { guides: true } });
  });

  it("taken out of the list again, leaves nothing behind in the Hotkeys lists", async () => {
    await withSketch();
    expect(addedGroups().map((group) => group.name)).toEqual(["Editor", "Sketch"]);
    await shell!.unmount();
    shell = undefined;
    document.body.replaceChildren();
    // Taken down with the shell, the Editor's key goes too, and comes back with it.
    expect(addedGroups()).toEqual([]);
    await openProject(WORKSPACES);
    expect(addedGroups()).toEqual([
      { id: "editor", name: "Editor", rows: [{ id: "add-comment", label: "Add Comment", chord: { key: "m", mod: true } }] },
    ]);
    expect(shortcutGroups().map((group) => group.name)).toEqual(["File", "Edit", "View", "Editor", "Writing"]);
    expect(viewRows().join("\n")).not.toContain("Sketch");
  });
});
