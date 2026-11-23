/**
 * Notes and Plan in the real shell, wired as `main.ts` wires them, over an
 * invented project in a temporary folder: Notes saves what is typed to
 * `notes.md` and opens again where the writer left it; Plan draws `plan.md`'s
 * cards on a grid as long as the project's target page count, and follows it
 * when Edit Project Details changes it; and turning either workspace off hides
 * its tab and leaves its file exactly as it was.
 */
// @vitest-environment jsdom
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const tabNames = (into: HTMLElement) => [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map((tab) => tab.textContent);
const selected = (into: HTMLElement) =>
  [...into.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;
const alt = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key, altKey: true, bubbles: true, cancelable: true }));

async function notesView(into: HTMLElement): Promise<EditorView> {
  await vi.waitFor(() => expect(into.querySelector(".notes__text")).not.toBeNull());
  const dom = into.querySelector(".notes__text");
  return (views.all as EditorView[]).find((view) => view.dom === dom)!;
}

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
  it("is Alt+2's tab, a plain notepad: typing saves notes.md, exactly as typed", async () => {
    const into = await openProject();
    alt("2");
    expect(selected(into)).toBe("Notes");
    const view = await notesView(into);
    view.dispatch(view.state.tr.insertText("# Ideas"));
    view.dispatch(view.state.tr.split(view.state.doc.content.size - 1));
    view.dispatch(view.state.tr.insertText("**The ferry** crosses at night.", view.state.doc.content.size - 1));
    expect(into.querySelector(".pill--save")!.getAttribute("data-state")).toBe("unsaved");
    expect(into.querySelector(".pill--counts")!.textContent).toBe("w. 7");
    // A couple of seconds after the writer stops (ADR-0028).
    await vi.waitFor(() => expect(existsSync(join(opened.path, "notes.md"))).toBe(true), { timeout: 4_000 });
    expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("# Ideas\n**The ferry** crosses at night.");
    // Plain text: no element, heading or bold is drawn for what was typed.
    expect(into.querySelector(".notes__text h1, .notes__text strong")).toBeNull();
  });

  it("saves on switching to another workspace, and undo and redo walk the edits", async () => {
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    view.dispatch(view.state.tr.insertText("one"));
    view.dispatch(view.state.tr.setTime(Date.now() + 10_000).insertText(" two", 4));
    const press = (key: string, shiftKey = false) =>
      view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
    press("z");
    expect(view.state.doc.textContent).toBe("one");
    press("y");
    expect(view.state.doc.textContent).toBe("one two");
    press("z");
    alt("1");
    await vi.waitFor(() => expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("one"));
    expect(selected(into)).toBe("Editor");
  });

  it("opens again with the text, the caret and the scroll where the writer left them", async () => {
    writeFileSync(join(opened.path, "notes.md"), "first line\nsecond line\nthird line");
    let into = await openProject();
    alt("2");
    let view = await notesView(into);
    // "sec|ond": offset 14 in the text is position 16 in the document.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 16)));
    // The notepad scrolls inside itself; the window's column does not move.
    const pad = into.querySelector<HTMLElement>(".notes")!;
    pad.scrollTop = 340;
    pad.dispatchEvent(new Event("scroll"));
    // A scroll anywhere else is not the notepad's.
    const column = into.querySelector<HTMLElement>(".shell__view")!;
    column.scrollTop = 25;
    column.dispatchEvent(new Event("scroll"));
    await closeProject();
    expect(readFileSync(join(temporary.path, "app-data", "workspace-places.txt"), "utf8")).toBe(
      "id-paper-boats\tnotes\tanchor=14\thead=14\tscroll=340\n",
    );

    views.all.length = 0;
    into = await openProject();
    alt("2");
    view = await notesView(into);
    expect(view.state.doc.textContent).toBe("first linesecond linethird line");
    expect(view.state.selection.head).toBe(16);
    await vi.waitFor(() => expect(into.querySelector<HTMLElement>(".notes")!.scrollTop).toBe(340));

    // Away to the Editor and back: the notepad is where it was, even if it
    // lost its scroll while it was out of sight.
    alt("1");
    into.querySelector<HTMLElement>(".notes")!.scrollTop = 0;
    alt("2");
    expect(into.querySelector<HTMLElement>(".notes")!.scrollTop).toBe(340);
  });

  it("answers a right-click with Write-ist's own menu, never the webview's", async () => {
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
  });

  it("turned off, hides its tab, drops the writer into the Editor, and keeps notes.md; turned on, finds it as it was", async () => {
    const into = await openProject();
    alt("2");
    const view = await notesView(into);
    view.dispatch(view.state.tr.insertText("Kept through the switch."));

    await editDetails(into, () => workspaceSwitch("notes").click());
    expect(tabNames(into)).toEqual(["Editor", "Plan"]);
    expect(selected(into)).toBe("Editor");
    // Taken down, which saved it, as closing does.
    await vi.waitFor(() => expect(into.querySelector(".notes")).toBeNull());
    expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("Kept through the switch.");
    // Alt+2 is Notes' own key, and there is no Notes tab now.
    alt("2");
    expect(selected(into)).toBe("Editor");

    await editDetails(into, () => workspaceSwitch("notes").click());
    expect(tabNames(into)).toEqual(["Editor", "Notes", "Plan"]);
    alt("2");
    const again = await notesView(into);
    expect(again.state.doc.textContent).toBe("Kept through the switch.");
    expect(readFileSync(join(opened.path, "notes.md"), "utf8")).toBe("Kept through the switch.");
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
    into.querySelector<HTMLButtonElement>('.plan__swatch[data-colour="green"]')!.click();
    expect(cardOf(into, "card-1").dataset["colour"]).toBe("green");
    await closeProject();
    const saved = readFileSync(join(opened.path, "plan.md"), "utf8");
    expect(saved).toContain("Colour: green\nLane: 3\nStarts at: 51%");
    expect(saved).toContain("They cross without lights.");
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
