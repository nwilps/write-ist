/**
 * Notes and Plan in the real shell, wired as `main.ts` wires them, over an
 * invented project in a temporary folder: Notes keeps each note as a `.md`
 * file in `notes/`, in tabs — six at most — new, opened, closed, renamed and deleted from its
 * bar — brings an old `notes.md` in, and opens again where the writer left it; Plan draws `plan.md`'s
 * cards on a grid as long as the project's target page count, and follows it
 * when Edit Project Details changes it; and turning either workspace off hides
 * its tab and leaves its file exactly as it was.
 */
// @vitest-environment jsdom
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { askToEditProjectDetails, type WorkspaceChoice } from "../../app/src/screens/project-dialogs.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import type { Project } from "../../src/project/bundle.ts";
import { createProject } from "../../src/project/create.ts";
import { readDetails } from "../../src/project/details.ts";
import { openWorkspacePlaces, type WorkspacePlaces } from "../../src/project/workspace-places.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

// Every editing view made, so a test can type into Notes' as the writer would.
const views = vi.hoisted(() => ({ all: [] as unknown[] }));
vi.mock("prosemirror-view", async (actual) => {
  const real = await actual<typeof import("prosemirror-view")>();
  class Kept extends real.EditorView {
    constructor(...args: ConstructorParameters<typeof real.EditorView>) {
      super(...args);
      views.all.push(this);
    }
  }
  return { ...real, EditorView: Kept };
});
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
const { WORKSPACES } = await import("../../app/src/workspaces/registry.ts");
const CHOICES: readonly WorkspaceChoice[] = WORKSPACES.map(({ id, name, alwaysOn }) => ({ id, name, alwaysOn: alwaysOn === true }));

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
let opened: Project;
let places: WorkspacePlaces;
let shell: MountedShell | undefined;

beforeEach(async () => {
  temporary = temporaryDirectory();
  projects = join(temporary.path, "write-ist");
  opened = await createProject({ filesystem: nodeFilesystem, newProjectId: () => "id-paper-boats" }, projects, {
    title: "Paper Boats",
    type: "Feature",
  });
  places = openWorkspacePlaces(nodeFilesystem, join(temporary.path, "app-data"));
  views.all.length = 0;
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  document.body.replaceChildren();
  temporary.remove();
});

async function openProject() {
  const into = document.createElement("div");
  document.body.append(into);
  const quiet = (): (() => void) => () => {};
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
    workspacePlaces: () => places,
    // As `main.ts` hands it over: the dictionary, for every workspace's toolbox.
    spellEngine: fakeEngine(),
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    openSettings: () => {},
    askToEditDetails: (route) =>
      askToEditProjectDetails(
        { filesystem: nodeFilesystem, projectsDirectory: async () => projects, reread: async () => {}, workspaces: CHOICES },
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
  // The window's column scrolls, as the stylesheet makes it.
  into.querySelector<HTMLElement>(".shell__view")!.style.overflowY = "auto";
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  return into;
}

async function closeProject(): Promise<void> {
  expect(await shell!.unmount()).toBe(true);
  shell = undefined;
  document.body.replaceChildren();
}

const tabNames = (into: HTMLElement) => [...into.querySelectorAll<HTMLButtonElement>(".workspace-bar__tab")].map((tab) => tab.textContent);
const selected = (into: HTMLElement) =>
  [...into.querySelectorAll<HTMLButtonElement>(".workspace-bar__tab")].find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
const alt = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }));

async function notesView(into: HTMLElement): Promise<EditorView> {
  await vi.waitFor(() => expect(into.querySelector(".notes__text:not([hidden])")).not.toBeNull());
  const dom = into.querySelector(".notes__text");
  return (views.all as EditorView[]).find((view) => view.dom === dom)!;
}

/** The note tabs, by name, left to right, and the one in front. */
const noteTabs = (into: HTMLElement) => [...into.querySelectorAll(".notes-tab .notes-tab__name")].map((name) => name.textContent);
const frontNote = (into: HTMLElement) => into.querySelector('.notes-tab[aria-selected="true"] .notes-tab__name')?.textContent;
const noteTab = (into: HTMLElement, name: string) =>
  [...into.querySelectorAll<HTMLElement>(".notes-tab")].find((tab) => tab.querySelector(".notes-tab__name")?.textContent === name)!;
const notesFolder = () => join(opened.path, "notes");
const noteFile = (name: string) => join(notesFolder(), `${name}.md`);
const folderFiles = () => (existsSync(notesFolder()) ? readdirSync(notesFolder()).sort() : []);
const emptyShown = (into: HTMLElement) => into.querySelector<HTMLElement>(".notes__empty")?.hidden === false;
function writeNotes(notes: Record<string, string>): void {
  mkdirSync(notesFolder(), { recursive: true });
  for (const [name, text] of Object.entries(notes)) writeFileSync(noteFile(name), text);
}
/** Open the folder menu and answer its rows, by name. */
async function folderMenu(into: HTMLElement): Promise<HTMLElement[]> {
  into.querySelector<HTMLButtonElement>(".notes-bar__folder")!.click();
  await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
  return [...document.querySelectorAll<HTMLElement>('.drop-menu--context [role="menuitem"]')];
}
const typeAtEnd = (view: EditorView, text: string) => view.dispatch(view.state.tr.insertText(text, view.state.doc.content.size - 1));

const dialog = () => document.querySelector<HTMLDialogElement>("dialog[open]");
async function editDetails(into: HTMLElement, change: () => void): Promise<void> {
  into.querySelector<HTMLElement>(".pill--project")!.click();
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  change();
  dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
  await vi.waitFor(() => expect(dialog()).toBeNull());
}
const workspaceSwitch = (id: string) => dialog()!.querySelector<HTMLButtonElement>(`#project-details-workspace-${id}`)!;
function typePages(pages: string): void {
  const box = dialog()!.querySelector<HTMLInputElement>("#project-details-pages")!;
  box.value = pages;
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Notes", () => {
  it("is Alt+2's tab; with no notes it waits quietly, and + makes Untitled, saved exactly as typed", async () => {
    const into = await openProject();
    alt("2");
    expect(selected(into)).toBe("Notes");
    await vi.waitFor(() => expect(emptyShown(into)).toBe(true));
    expect(into.querySelector(".notes__empty")!.textContent).toBe("No note open.Choose one from the folder, or start a new one with +.");
    expect(noteTabs(into)).toEqual([]);
    // Nothing is made until the writer asks.
    expect(existsSync(notesFolder())).toBe(false);

    into.querySelector<HTMLButtonElement>(".notes-bar__new")!.click();
    const view = await notesView(into);
    expect(noteTabs(into)).toEqual(["Untitled"]);
    expect(frontNote(into)).toBe("Untitled");
    expect(emptyShown(into)).toBe(false);
    expect(folderFiles()).toEqual(["Untitled.md"]);
    view.dispatch(view.state.tr.insertText("# Ideas"));
    view.dispatch(view.state.tr.split(view.state.doc.content.size - 1));
    typeAtEnd(view, "**The ferry** crosses at night.");
    expect(into.querySelector(".pill--save")!.getAttribute("data-state")).toBe("unsaved");
    expect(into.querySelector(".pill--counts")!.textContent).toBe("w. 7");
    // A couple of seconds after the writer stops (ADR-0028).
    await vi.waitFor(() => expect(readFileSync(noteFile("Untitled"), "utf8")).toBe("# Ideas\n**The ferry** crosses at night."), {
      timeout: 4_000,
    });
    // Plain text: no element, heading or bold is drawn for what was typed.
    expect(into.querySelector(".notes__text h1, .notes__text strong")).toBeNull();

    // + again: the next free name, in a tab of its own, in front.
    into.querySelector<HTMLButtonElement>(".notes-bar__new")!.click();
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Untitled", "Untitled 2"]));
    expect(frontNote(into)).toBe("Untitled 2");
    expect(folderFiles()).toEqual(["Untitled 2.md", "Untitled.md"]);
  });

  it("saves the note it leaves on switching tabs and workspaces, and keeps each note's own undo", async () => {
    writeNotes({ Ideas: "", Ferry: "" });
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    // jsdom lays nothing out, so an undo cannot be scrolled to.
    vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(noteTabs(into)).toEqual(["Ferry"]);
    view.dispatch(view.state.tr.insertText("one"));
    view.dispatch(view.state.tr.setTime(Date.now() + 10_000).insertText(" two", 4));
    const press = (key: string, shiftKey = false) =>
      view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
    press("z");
    expect(view.state.doc.textContent).toBe("one");
    press("y");
    expect(view.state.doc.textContent).toBe("one two");

    // Open Ideas from the folder: Ferry is saved on the way, long before the pause.
    const rows = await folderMenu(into);
    expect(rows.map((row) => row.textContent)).toEqual(["Ferry", "Ideas"]);
    rows[1]!.click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Ideas"));
    await vi.waitFor(() => expect(readFileSync(noteFile("Ferry"), "utf8")).toBe("one two"));
    expect(view.state.doc.textContent).toBe("");
    view.dispatch(view.state.tr.insertText("ideas"));
    // Undo here is Ideas' own; Ferry's history is untouched.
    press("z");
    expect(view.state.doc.textContent).toBe("");
    press("y");

    // Back to Ferry by its tab: its words, and its undo, are its own.
    noteTab(into, "Ferry").click();
    expect(frontNote(into)).toBe("Ferry");
    expect(view.state.doc.textContent).toBe("one two");
    press("z");
    expect(view.state.doc.textContent).toBe("one");
    alt("1");
    await vi.waitFor(() => expect(readFileSync(noteFile("Ferry"), "utf8")).toBe("one"));
    expect(readFileSync(noteFile("Ideas"), "utf8")).toBe("ideas");
    expect(selected(into)).toBe("Editor");
  });

  it("brings an old notes.md into the folder as Notes, once, with its caret and scroll", async () => {
    writeFileSync(join(opened.path, "notes.md"), "first line\nsecond line\nthird line");
    // Where the one notepad was left, before there were tabs.
    mkdirSync(join(temporary.path, "app-data"), { recursive: true });
    writeFileSync(join(temporary.path, "app-data", "workspace-places.txt"), "id-paper-boats\tnotes\tanchor=14\thead=14\tscroll=340\n");
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    expect(noteTabs(into)).toEqual(["Notes"]);
    expect(existsSync(join(opened.path, "notes.md"))).toBe(false);
    expect(folderFiles()).toEqual(["Notes.md"]);
    expect(readFileSync(noteFile("Notes"), "utf8")).toBe("first line\nsecond line\nthird line");
    expect(view.state.doc.textContent).toBe("first linesecond linethird line");
    expect(view.state.selection.head).toBe(16);
    await vi.waitFor(() => expect(into.querySelector<HTMLElement>(".notes")!.scrollTop).toBe(340));
  });

  it("never overwrites a note already called Notes: the old notes.md comes in beside it", async () => {
    writeNotes({ Notes: "Already in the folder." });
    writeFileSync(join(opened.path, "notes.md"), "From before the folder.");
    const into = await openProject();
    alt("2");
    await notesView(into);
    expect(noteTabs(into)).toEqual(["Notes 2"]);
    expect(folderFiles()).toEqual(["Notes 2.md", "Notes.md"]);
    expect(readFileSync(noteFile("Notes"), "utf8")).toBe("Already in the folder.");
    expect(readFileSync(noteFile("Notes 2"), "utf8")).toBe("From before the folder.");
    expect(existsSync(join(opened.path, "notes.md"))).toBe(false);
  });

  it("opens again with the same tabs, the same one in front, and each note's caret and scroll", async () => {
    writeNotes({ Alpha: "alpha", Beta: "first line\nsecond line\nthird line", Gamma: "gamma" });
    let into = await openProject();
    alt("2");
    let view = await notesView(into);
    for (const name of ["Gamma", "Beta"]) {
      const rows = await folderMenu(into);
      rows.find((row) => row.textContent === name)!.click();
      await vi.waitFor(() => expect(frontNote(into)).toBe(name));
    }
    expect(noteTabs(into)).toEqual(["Alpha", "Gamma", "Beta"]);
    view = await notesView(into);
    // "sec|ond": offset 14 in the text is position 16 in the document.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 16)));
    const pad = into.querySelector<HTMLElement>(".notes")!;
    pad.scrollTop = 340;
    pad.dispatchEvent(new Event("scroll"));
    // A scroll anywhere else is not the note's.
    const column = into.querySelector<HTMLElement>(".shell__view")!;
    column.scrollTop = 25;
    column.dispatchEvent(new Event("scroll"));
    await closeProject();
    const kept = readFileSync(join(temporary.path, "app-data", "workspace-places.txt"), "utf8");
    expect(kept).toContain('id-paper-boats\tnotes\topen=3\ttab-1="Alpha"\ttab-2="Gamma"\ttab-3="Beta"\tactive="Beta"\n');
    expect(kept).toContain('id-paper-boats\tnotes\t"Beta"\tanchor=14\thead=14\tscroll=340\n');
    // Session memory is the application's, never the project's.
    expect(readdirSync(opened.path)).not.toContain("workspace-places.txt");

    views.all.length = 0;
    into = await openProject();
    alt("2");
    view = await notesView(into);
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Alpha", "Gamma", "Beta"]));
    expect(frontNote(into)).toBe("Beta");
    expect(view.state.doc.textContent).toBe("first linesecond linethird line");
    expect(view.state.selection.head).toBe(16);
    await vi.waitFor(() => expect(into.querySelector<HTMLElement>(".notes")!.scrollTop).toBe(340));

    // Away to the Editor and back: the note is where it was.
    alt("1");
    into.querySelector<HTMLElement>(".notes")!.scrollTop = 0;
    alt("2");
    expect(into.querySelector<HTMLElement>(".notes")!.scrollTop).toBe(340);
  });

  it("closes a tab with ×, saving it and keeping its file; with the last closed, waits quietly", async () => {
    writeNotes({ Ideas: "" });
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    view.dispatch(view.state.tr.insertText("Kept on closing."));
    noteTab(into, "Ideas").querySelector<HTMLButtonElement>(".notes-tab__close")!.click();
    await vi.waitFor(() => expect(noteTabs(into)).toEqual([]));
    expect(readFileSync(noteFile("Ideas"), "utf8")).toBe("Kept on closing.");
    expect(folderFiles()).toEqual(["Ideas.md"]);
    expect(emptyShown(into)).toBe(true);
    expect(into.querySelector<HTMLElement>(".notes__text")!.hidden).toBe(true);
    expect(into.querySelector(".pill--counts")!.hasAttribute("hidden")).toBe(true);
    // No alarm and nothing to dismiss: no dialog, no trouble said.
    expect(dialog()).toBeNull();
    expect(into.querySelector(".trouble, [role='alert']")).toBeNull();

    // Still in the folder, and opened again from it.
    const rows = await folderMenu(into);
    expect(rows.map((row) => row.textContent)).toEqual(["Ideas"]);
    rows[0]!.click();
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Ideas"]));
    expect((await notesView(into)).state.doc.textContent).toBe("Kept on closing.");

    // And the empty state is remembered: closed, it opens closed.
    noteTab(into, "Ideas").querySelector<HTMLButtonElement>(".notes-tab__close")!.click();
    await vi.waitFor(() => expect(noteTabs(into)).toEqual([]));
    await closeProject();
    const again = await openProject();
    alt("2");
    await vi.waitFor(() => expect(emptyShown(again)).toBe(true));
    expect(noteTabs(again)).toEqual([]);
  });

  it("opens six tabs at most: + and the closed notes in the folder menu grey, quietly, until a tab closes", async () => {
    const names = Array.from({ length: 8 }, (_, index) => `Note ${index + 1}`);
    writeNotes(Object.fromEntries(names.map((name) => [name, name])));
    const into = await openProject();
    alt("2");
    await notesView(into);
    const plus = into.querySelector<HTMLButtonElement>(".notes-bar__new")!;
    for (const name of names.slice(1, 6)) {
      expect(plus.disabled).toBe(false);
      const rows = await folderMenu(into);
      rows.find((row) => row.textContent === name)!.click();
      await vi.waitFor(() => expect(frontNote(into)).toBe(name));
    }
    expect(noteTabs(into)).toEqual(names.slice(0, 6));
    // Six: + is still there, beside the last tab, greyed and doing nothing.
    expect(plus.hidden).toBe(false);
    expect(plus.disabled).toBe(true);
    expect(plus.previousElementSibling?.lastElementChild).toBe(noteTab(into, "Note 6"));
    plus.click();
    await new Promise((settle) => setTimeout(settle, 0));
    expect(folderFiles()).toHaveLength(8);
    expect(noteTabs(into)).toHaveLength(6);

    // The folder menu: the closed notes greyed, the open ones still brought forward.
    let rows = await folderMenu(into);
    const row = (name: string) => rows.find((each) => each.textContent === name)!;
    for (const name of names.slice(6)) expect(row(name).getAttribute("aria-disabled")).toBe("true");
    for (const name of names.slice(0, 6)) expect(row(name).hasAttribute("aria-disabled")).toBe(false);
    row("Note 7").click();
    // Nothing happens, and the menu stays open: nothing to dismiss, nothing said.
    expect(document.querySelector(".drop-menu--context")).not.toBeNull();
    expect(noteTabs(into)).toEqual(names.slice(0, 6));
    expect(dialog()).toBeNull();
    expect(into.querySelector(".trouble, [role='alert']")).toBeNull();
    row("Note 2").click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Note 2"));
    expect(noteTabs(into)).toHaveLength(6);

    // A closed note can still be deleted from the menu while it is greyed.
    rows = await folderMenu(into);
    row("Note 8").querySelector<HTMLElement>(".drop-menu__aside")!.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(folderFiles()).not.toContain("Note 8.md");

    // Close one: + and the closed notes come back.
    noteTab(into, "Note 3").querySelector<HTMLButtonElement>(".notes-tab__close")!.click();
    await vi.waitFor(() => expect(plus.disabled).toBe(false));
    rows = await folderMenu(into);
    expect(row("Note 7").hasAttribute("aria-disabled")).toBe(false);
    row("Note 7").click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Note 7"));
    expect(noteTabs(into)).toEqual(["Note 1", "Note 2", "Note 4", "Note 5", "Note 6", "Note 7"]);
    expect(plus.disabled).toBe(true);
  });

  it("puts + right after the last tab, and after the folder with none open", async () => {
    writeNotes({ Ideas: "" });
    const into = await openProject();
    alt("2");
    await notesView(into);
    const bar = into.querySelector<HTMLElement>(".notes-bar")!;
    const strip = into.querySelector<HTMLElement>(".notes-tabs")!;
    expect([...bar.children].map((child) => child.className)).toEqual(["notes-bar__pill notes-bar__folder", "notes-tabs", "notes-bar__pill notes-bar__new"]);
    expect(strip.lastElementChild).toBe(noteTab(into, "Ideas"));
    noteTab(into, "Ideas").querySelector<HTMLButtonElement>(".notes-tab__close")!.click();
    await vi.waitFor(() => expect(noteTabs(into)).toEqual([]));
    // Empty, so the stylesheet does not draw it (`.notes-tabs:empty`): + is the folder's neighbour.
    expect(strip.childNodes).toHaveLength(0);
    expect(strip.matches(":empty")).toBe(true);
  });

  it("opens no more than six tabs kept from an older session, the one in front always among them", async () => {
    const names = Array.from({ length: 8 }, (_, index) => `Note ${index + 1}`);
    writeNotes(Object.fromEntries(names.map((name) => [name, name])));
    await places.remember("id-paper-boats", "notes", {
      open: 8,
      ...Object.fromEntries(names.map((name, index) => [`tab-${index + 1}`, name])),
      active: "Note 8",
    });
    const into = await openProject();
    alt("2");
    await notesView(into);
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Note 1", "Note 2", "Note 3", "Note 4", "Note 5", "Note 8"]));
    expect(frontNote(into)).toBe("Note 8");
    expect(into.querySelector<HTMLButtonElement>(".notes-bar__new")!.disabled).toBe(true);
    await closeProject();
    // Kept as it is now: six.
    const kept = readFileSync(join(temporary.path, "app-data", "workspace-places.txt"), "utf8");
    expect(kept).toContain('id-paper-boats\tnotes\topen=6\ttab-1="Note 1"\ttab-2="Note 2"\ttab-3="Note 3"\ttab-4="Note 4"\ttab-5="Note 5"\ttab-6="Note 8"\tactive="Note 8"\n');
  });

  it("renames the note in front by double-clicking its tab: the file follows, made safe and numbered quietly", async () => {
    writeNotes({ Untitled: "The ferry.", Ferry: "Another note." });
    const into = await openProject();
    alt("2");
    let view = await notesView(into);
    (await folderMenu(into)).find((row) => row.textContent === "Untitled")!.click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Untitled"));
    const rename = async (from: string, typed: string, key = "Enter") => {
      noteTab(into, from).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const input = into.querySelector<HTMLInputElement>(".notes-tab__rename")!;
      expect(input.value).toBe(from);
      input.value = typed;
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    };

    // A double-click on a tab behind another only brings it forward; it renames nothing.
    noteTab(into, "Ferry").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(into.querySelector(".notes-tab__rename")).toBeNull();

    await rename("Untitled", 'The "ferry": at night?');
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Ferry", "The ferry at night"]));
    expect(folderFiles()).toEqual(["Ferry.md", "The ferry at night.md"]);
    expect(readFileSync(noteFile("The ferry at night"), "utf8")).toBe("The ferry.");

    // A name another note has: numbered, and the other note untouched.
    await rename("The ferry at night", "ferry.md");
    await vi.waitFor(() => expect(noteTabs(into)).toEqual(["Ferry", "ferry 2"]));
    expect(folderFiles()).toEqual(["Ferry.md", "ferry 2.md"]);
    expect(readFileSync(noteFile("Ferry"), "utf8")).toBe("Another note.");

    // Escape leaves it as it was.
    await rename("ferry 2", "Something else", "Escape");
    expect(noteTabs(into)).toEqual(["Ferry", "ferry 2"]);
    expect(folderFiles()).toEqual(["Ferry.md", "ferry 2.md"]);

    // Typing goes on into the renamed file, and its place goes with it.
    view = await notesView(into);
    typeAtEnd(view, " More.");
    await closeProject();
    expect(readFileSync(noteFile("ferry 2"), "utf8")).toBe("The ferry. More.");
    expect(folderFiles()).toEqual(["Ferry.md", "ferry 2.md"]);
    const kept = readFileSync(join(temporary.path, "app-data", "workspace-places.txt"), "utf8");
    expect(kept).toContain('tab-2="ferry 2"\tactive="ferry 2"');
    expect(kept).not.toContain('"Untitled"');
  });

  it("deletes a note from the folder menu only after the alarm-coloured confirmation, closing its tab", async () => {
    writeNotes({ Ideas: "To be deleted.", Keep: "Stays." });
    const into = await openProject();
    alt("2");
    await notesView(into);
    (await folderMenu(into)).find((row) => row.textContent === "Keep")!.click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Keep"));
    (await folderMenu(into)).find((row) => row.textContent === "Ideas")!.click();
    await vi.waitFor(() => expect(frontNote(into)).toBe("Ideas"));
    expect(noteTabs(into)).toEqual(["Ideas", "Keep"]);

    const deleteFromMenu = async () => {
      const row = (await folderMenu(into)).find((each) => each.textContent === "Ideas")!;
      const aside = row.querySelector<HTMLElement>(".drop-menu__aside")!;
      expect(aside.getAttribute("aria-label")).toBe("Delete Ideas");
      expect(aside.classList.contains("drop-menu__aside--alarm")).toBe(true);
      aside.click();
      await vi.waitFor(() => expect(dialog()).not.toBeNull());
    };

    // Cancel: nothing happens.
    await deleteFromMenu();
    expect(dialog()!.getAttribute("aria-label")).toBe("Delete Note");
    expect(dialog()!.classList.contains("project-dialog--alarm")).toBe(true);
    expect(dialog()!.textContent).toContain('Delete "Ideas"?');
    expect(document.activeElement?.textContent).toContain("Cancel");
    dialog()!.close();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(folderFiles()).toEqual(["Ideas.md", "Keep.md"]);
    expect(noteTabs(into)).toEqual(["Ideas", "Keep"]);

    // Confirmed: the file goes, its tab closes, the next tab comes forward.
    await deleteFromMenu();
    dialog()!.querySelector<HTMLFormElement>("form")!.requestSubmit();
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(folderFiles()).toEqual(["Keep.md"]);
    expect(noteTabs(into)).toEqual(["Keep"]);
    expect(frontNote(into)).toBe("Keep");
    expect((await folderMenu(into)).map((row) => row.textContent)).toEqual(["Keep"]);
    // Nothing waiting brings it back.
    await closeProject();
    expect(folderFiles()).toEqual(["Keep.md"]);
    expect(readFileSync(noteFile("Keep"), "utf8")).toBe("Stays.");
  });

  it("answers a right-click with Write-ist's own menu, never the webview's", async () => {
    writeNotes({ Ideas: "" });
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    // jsdom lays nothing out, so there is no point under the pointer: the caret stands in.
    vi.spyOn(view, "posAtCoords").mockReturnValue(null);
    const click = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    view.dom.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
    const labels = [...document.querySelectorAll('.drop-menu--context [role="menuitem"], .drop-menu--context [role="menuitemcheckbox"]')].map(
      (item) => item.textContent,
    );
    expect(labels.join(" ")).toMatch(/Cut.*Copy.*Paste.*Select All.*Undo.*Redo.*Spellcheck/);
    // The bar's own right-click is suppressed too.
    const onBar = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    into.querySelector(".notes-bar")!.dispatchEvent(onBar);
    expect(onBar.defaultPrevented).toBe(true);
  });

  it("turned off, hides its tab, drops the writer into the Editor, and keeps the notes folder; turned on, finds it as it was", async () => {
    writeNotes({ Ideas: "" });
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    view.dispatch(view.state.tr.insertText("Kept through the switch."));

    await editDetails(into, () => workspaceSwitch("notes").click());
    expect(tabNames(into)).toEqual(["Editor", "Plan"]);
    expect(selected(into)).toBe("Editor");
    // Taken down, which saved it, as closing does.
    await vi.waitFor(() => expect(into.querySelector(".notes")).toBeNull());
    expect(readFileSync(noteFile("Ideas"), "utf8")).toBe("Kept through the switch.");
    expect(folderFiles()).toEqual(["Ideas.md"]);
    // Alt+2 is Notes' own key, and there is no Notes tab now.
    alt("2");
    expect(selected(into)).toBe("Editor");

    await editDetails(into, () => workspaceSwitch("notes").click());
    expect(tabNames(into)).toEqual(["Editor", "Notes", "Plan"]);
    alt("2");
    const again = await notesView(into);
    expect(again.state.doc.textContent).toBe("Kept through the switch.");
    expect(readFileSync(noteFile("Ideas"), "utf8")).toBe("Kept through the switch.");
  });
});

describe("Plan", () => {
  const PLAN = [
    "# Plan",
    "",
    "## The ferry at night",
    "",
    "Card: card-1",
    "Colour: blue",
    "Lane: 2",
    "Starts at: 50%",
    "Length: 2%",
    "",
    "They cross without lights.",
    "",
  ].join("\n");

  const cardOf = (into: HTMLElement, id: string) => into.querySelector<HTMLElement>(`.plan__card[data-id="${id}"]`)!;
  const surface = (into: HTMLElement) => into.querySelector<HTMLElement>(".plan__surface")!;
  /** Select a card as a press would, without a layout to measure in jsdom. */
  const selectCard = (into: HTMLElement, id: string) => {
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    cardOf(into, id).dispatchEvent(Object.assign(press, { pointerId: 1 }));
    cardOf(into, id).dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  };

  it("is Alt+3's tab, and draws plan.md's cards on a grid as long as the target page count", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    await editDetails(into, () => typePages("110"));
    alt("3");
    expect(selected(into)).toBe("Plan");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    const card = cardOf(into, "card-1");
    expect(card.textContent).toBe("The ferry at night");
    expect(card.dataset["colour"]).toBe("blue");
    expect(card.style.getPropertyValue("--card-lane")).toBe("1");
    expect(card.style.getPropertyValue("--card-cell")).toBe("55");
    expect(surface(into).style.getPropertyValue("--plan-length")).toBe("110");
    expect(into.querySelector(".pill--counts")!.textContent).toBe("1 card");
  });

  it("puts every structure beat on a whole square's edge, with a column of dots under it, at every target length", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN.replace("# Plan\n", "# Plan\n\nStructure: save-the-cat, heros-journey, sequence-approach, story-circle\n"));
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    for (const pages of ["90", "100", "110", "120"]) {
      await editDetails(into, () => typePages(pages));
      const columns = Number(surface(into).style.getPropertyValue("--plan-columns"));
      const dotted = new Set(
        [...into.querySelectorAll<HTMLElement>(".plan__dot-column")].map((column) => Number(column.style.getPropertyValue("--dot-cell"))),
      );
      // A column on every edge, the first and the last included, and no other.
      expect(dotted.size).toBe(columns + 1);
      expect(into.querySelectorAll(".plan__dot-column").length).toBe(columns + 1);
      const beats = [...into.querySelectorAll<HTMLElement>(".plan__beat")].map((beat) => beat.style.getPropertyValue("--beat-cell"));
      expect(beats.length).toBeGreaterThan(30);
      for (const cell of beats) {
        expect(cell).toMatch(/^\d+$/);
        expect(dotted.has(Number(cell))).toBe(true);
      }
      expect(dotted.has(Number(pages))).toBe(true);
    }
  });

  it("follows a new target page count: the grid resizes, the card keeps its place in the whole, plan.md is not rewritten", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    await editDetails(into, () => typePages("110"));
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    await editDetails(into, () => typePages("90"));
    expect(surface(into).style.getPropertyValue("--plan-length")).toBe("90");
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-cell")).toBe("45");
    // No target: a modest feature length, and the card still where it was in the whole.
    await editDetails(into, () => typePages(""));
    expect(surface(into).style.getPropertyValue("--plan-length")).toBe("100");
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-cell")).toBe("50");
    await closeProject();
    expect(readFileSync(join(opened.path, "plan.md"), "utf8")).toBe(PLAN);
  });

  it("moves the selected card with the arrows and colours it from the panel, and saves both on leaving", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    // Select it as a press would, without a layout to measure in jsdom.
    const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    cardOf(into, "card-1").dispatchEvent(Object.assign(press, { pointerId: 1 }));
    cardOf(into, "card-1").dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    expect(into.querySelector<HTMLElement>(".plan__panel")!.hidden).toBe(false);
    const key = (name: string) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    key("ArrowRight");
    key("ArrowDown");
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-cell")).toBe("51");
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-lane")).toBe("2");
    into.querySelector<HTMLButtonElement>(".plan__palette-button")!.click();
    into.querySelector<HTMLButtonElement>('.plan__swatch[data-colour="green"]')!.click();
    expect(cardOf(into, "card-1").dataset["colour"]).toBe("green");
    await closeProject();
    const saved = readFileSync(join(opened.path, "plan.md"), "utf8");
    expect(saved).toContain("Colour: green\nLane: 3\nStarts at: 51%");
    expect(saved).toContain("They cross without lights.");
  });

  it("hides the project name pill on Plan only, as Plan's manifest asks; the Editor and Notes show it", async () => {
    const byId = Object.fromEntries(WORKSPACES.map((manifest) => [manifest.id, manifest]));
    expect(byId["plan"]!.showsProjectName).toBe(false);
    expect(byId["editor"]!.showsProjectName).toBeUndefined();
    expect(byId["notes"]!.showsProjectName).toBeUndefined();
    const into = await openProject();
    const pill = into.querySelector<HTMLElement>(".pill--project")!;
    expect(pill.hidden).toBe(false);
    alt("2");
    expect(pill.hidden).toBe(false);
    alt("3");
    expect(selected(into)).toBe("Plan");
    expect(pill.hidden).toBe(true);
    alt("1");
    expect(pill.hidden).toBe(false);
    alt("3");
    expect(pill.hidden).toBe(true);
    alt("2");
    expect(pill.hidden).toBe(false);
  });

  it("puts the selected card beside the Structure button under the grid, its pages centred as − 56–57 +, Delete a trash icon alone", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    await editDetails(into, () => typePages("110"));
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    const under = into.querySelector<HTMLElement>(".plan__under")!;
    expect(under.previousElementSibling).toBe(into.querySelector(".plan__board"));
    expect([...under.children].map((child) => child.className)).toEqual(["plan__controls", "plan__card-slot"]);
    expect(under.querySelector(".plan__card-slot > .plan__panel")).not.toBeNull();
    selectCard(into, "card-1");
    const panel = into.querySelector<HTMLElement>(".plan__panel")!;
    expect(panel.hidden).toBe(false);
    const foot = panel.querySelector<HTMLElement>(".plan__panel-foot")!;
    expect([...foot.children].map((child) => child.className)).toEqual([
      "plan__palette",
      "plan__stepper",
      "plan__icon-button plan__delete",
    ]);
    // The pages, and nothing of the target.
    expect(foot.querySelector(".plan__stepper")!.textContent).toBe("−56–57+");
    expect(foot.textContent).not.toContain("of");
    // Delete: the trash icon, no words.
    const remove = foot.querySelector<HTMLButtonElement>(".plan__delete")!;
    expect(remove.textContent).toBe("");
    expect(remove.querySelectorAll("svg")).toHaveLength(1);
    expect(remove.getAttribute("aria-label")).toBe("Delete Card");
    // The palette: an icon, no words, and no swatches on the card itself.
    const palette = foot.querySelector<HTMLButtonElement>(".plan__palette-button")!;
    expect(palette.textContent).toBe("");
    expect(palette.querySelectorAll("svg")).toHaveLength(1);
    expect(panel.querySelector(".plan__swatches")).toBeNull();
    // Shorter: one page.
    foot.querySelector<HTMLButtonElement>('[aria-label="Shorter"]')!.click();
    expect(foot.querySelector(".plan__stepper")!.textContent).toBe("−56+");
    remove.click();
    expect(into.querySelector('.plan__card[data-id="card-1"]')).toBeNull();
    expect(panel.hidden).toBe(true);
  });

  it("chooses a colour from nine, three by three, in a picker of Write-ist's own that opens from the palette icon", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    selectCard(into, "card-1");
    const button = into.querySelector<HTMLButtonElement>(".plan__palette-button")!;
    const menu = into.querySelector<HTMLElement>(".plan__palette-menu")!;
    expect(menu.hidden).toBe(true);
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    // From the keyboard: open, on the card's own colour.
    button.focus();
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(menu.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const swatches = [...menu.querySelectorAll<HTMLButtonElement>(".plan__swatch")];
    expect(swatches.map((swatch) => swatch.dataset["colour"])).toEqual(["plain", "sand", "yellow", "orange", "red", "purple", "blue", "aqua", "green"]);
    expect(swatches.map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
      "No Colour", "Sand", "Yellow", "Orange", "Red", "Purple", "Blue", "Aqua", "Green",
    ]);
    expect(swatches.every((swatch) => swatch.getAttribute("role") === "menuitemradio")).toBe(true);
    expect(document.activeElement).toBe(swatches[6]);
    expect(swatches[6]!.getAttribute("aria-checked")).toBe("true");
    // The arrows move across a row and down a column; the card does not move with them.
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    press("ArrowRight");
    expect(document.activeElement).toBe(swatches[7]);
    press("ArrowUp");
    expect(document.activeElement).toBe(swatches[4]);
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-cell")).toBe("50");
    // Escape closes the picker and nothing else: the card stays selected.
    press("Escape");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(into.querySelector<HTMLElement>(".plan__panel")!.hidden).toBe(false);
    // A press outside closes it too.
    button.click();
    expect(menu.hidden).toBe(false);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(menu.hidden).toBe(true);
    // Chosen: the card takes it, and the picker closes.
    button.click();
    swatches[1]!.click();
    expect(menu.hidden).toBe(true);
    expect(cardOf(into, "card-1").dataset["colour"]).toBe("sand");
    expect(into.querySelector<HTMLElement>(".plan__panel")!.dataset["colour"]).toBe("sand");
    expect(swatches[1]!.getAttribute("aria-checked")).toBe("true");
    await closeProject();
    expect(readFileSync(join(opened.path, "plan.md"), "utf8")).toContain("Colour: sand\n");
  });

  it("grows the card's description with what is written: an unseen copy of the text sizes it", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    selectCard(into, "card-1");
    const box = into.querySelector<HTMLElement>(".plan__description-box")!;
    const field = box.querySelector<HTMLTextAreaElement>(".plan__description")!;
    expect(box.dataset["value"]).toBe("They cross without lights.");
    field.value = "They cross without lights.\nThe ferryman counts the coins.\nNobody speaks.";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    expect(box.dataset["value"]).toBe(field.value);
  });

  it("shows one structure at a time: choosing another replaces it, choosing it again shows none", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    const choose = async (name: string) => {
      into.querySelector<HTMLButtonElement>(".plan__control")!.click();
      await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
      [...document.querySelectorAll<HTMLElement>(".drop-menu--context [role='menuitemcheckbox']")].find((row) => row.textContent === name)!.click();
    };
    const sheets = () => new Set([...into.querySelectorAll<HTMLElement>(".plan__beat-label")].map((label) => label.dataset["sheet"]));
    const ticked = async () => {
      into.querySelector<HTMLButtonElement>(".plan__control")!.click();
      await vi.waitFor(() => expect(document.querySelector(".drop-menu--context")).not.toBeNull());
      const on = [...document.querySelectorAll<HTMLElement>(".drop-menu--context [aria-checked='true']")].map((row) => row.textContent);
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      return on;
    };
    await choose("Save the Cat");
    expect(sheets()).toEqual(new Set(["save-the-cat"]));
    await choose("Story Circle");
    expect(sheets()).toEqual(new Set(["story-circle"]));
    expect(await ticked()).toEqual(["Story Circle"]);
    await choose("Story Circle");
    expect(sheets()).toEqual(new Set());
    expect(await ticked()).toEqual([]);
    await choose("Save the Cat");
    await closeProject();
    expect(readFileSync(join(opened.path, "plan.md"), "utf8")).toContain("Structure: save-the-cat\n");
  });

  it("while a card is dragged, moves only that card: the grid is not drawn or measured again until it is dropped", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    const grid = into.querySelector<HTMLElement>(".plan__grid")!;
    const gridSize = () => ["--plan-columns", "--plan-lanes", "--plan-length", "--plan-beat-rows"].map((name) => surface(into).style.getPropertyValue(name));
    const before = gridSize();
    const card = cardOf(into, "card-1");
    const pointer = (type: string, x: number, y: number) =>
      card.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }), { pointerId: 1 }));
    // Without a layout in jsdom, a square is the token's 32 pixels.
    pointer("pointerdown", 100, 100);
    expect(card.dataset["dragging"]).toBe("true");
    for (const [x, y] of [[132, 100], [164, 132], [228, 164], [260, 100]] as const) {
      pointer("pointermove", x, y);
      expect(into.querySelector(".plan__grid")).toBe(grid);
      expect(cardOf(into, "card-1")).toBe(card);
      expect(gridSize()).toEqual(before);
    }
    expect(card.style.getPropertyValue("--card-cell")).toBe("55");
    expect(card.style.getPropertyValue("--card-lane")).toBe("1");
    pointer("pointerup", 260, 100);
    // Dropped: now the grid is drawn again, with the card in its new place.
    expect(into.querySelector(".plan__grid")).not.toBe(grid);
    expect(gridSize()).toEqual(before);
    expect(cardOf(into, "card-1").style.getPropertyValue("--card-cell")).toBe("55");
    expect(cardOf(into, "card-1").dataset["dragging"]).toBeUndefined();
  });

  it("turned off, hides its tab, drops the writer into the Editor, and keeps plan.md; turned on, finds it as it was", async () => {
    writeFileSync(join(opened.path, "plan.md"), PLAN);
    const into = await openProject();
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    await editDetails(into, () => workspaceSwitch("plan").click());
    expect(tabNames(into)).toEqual(["Editor", "Notes"]);
    expect(selected(into)).toBe("Editor");
    expect(readFileSync(join(opened.path, "plan.md"), "utf8")).toBe(PLAN);
    alt("3");
    expect(selected(into)).toBe("Editor");

    await editDetails(into, () => workspaceSwitch("plan").click());
    alt("3");
    await vi.waitFor(() => expect(cardOf(into, "card-1")).not.toBeNull());
    expect(cardOf(into, "card-1").textContent).toBe("The ferry at night");
    expect(readFileSync(join(opened.path, "plan.md"), "utf8")).toBe(PLAN);
  });
});
