/**
 * Jumps centre the caret's line (`caret-centre.ts`), and typing and Undo do
 * not; and Ctrl+Alt+Enter opens the paper's right-click menu at the caret, on a
 * key the writer can change.
 *
 * The real shell and Editor over Brick & Steel, in a temporary folder.
 * `centreCaretLine` is watched, not replaced: the jumps call the real one.
 */
// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "prosemirror-view";
import { centredScrollTop } from "../../app/src/workspaces/editor/caret-centre.ts";
import { centrePaper, GLIDE_LIMIT_MS, scrollCaretIntoView } from "../../app/src/workspaces/editor/caret-margin.ts";
import { mountShell, type MountedShell } from "../../app/src/shell/shell.ts";
import {
  chordMatches,
  chordName,
  chordOf,
  type KeyPress,
} from "../../app/src/screens/shortcuts.ts";
import { commandById, shortcutCommands, useKeyBindings } from "../../app/src/workspaces/editor/commands.ts";
import { shortcutGroups } from "../../app/src/workspaces/editor/keyboard-shortcuts-dialog.ts";
import { keyBindingOf } from "../../src/settings/settings.ts";
import { importProject } from "../../src/project/import.ts";
import type { Project } from "../../src/project/bundle.ts";
import { caretPlaceOf, type CaretPlace } from "../../src/screenplay/caret-place.ts";
import { readFixtureBytes } from "../support/files.ts";
import { nodeFilesystem, temporaryDirectory } from "../support/node-filesystem.ts";
import { fakeEngine } from "../support/spell-engine.ts";

const paper = vi.hoisted(() => ({ view: undefined as unknown }));
vi.mock("prosemirror-view", async (actual) => {
  const real = await actual<typeof import("prosemirror-view")>();
  class Kept extends real.EditorView {
    constructor(...args: ConstructorParameters<typeof real.EditorView>) {
      super(...args);
      paper.view = this;
      // jsdom lays nothing out: the caret is drawn somewhere fixed.
      this.coordsAtPos = () => ({ left: 200, right: 200, top: 300, bottom: 316 });
    }
  }
  return { ...real, EditorView: Kept };
});
vi.mock("../../app/src/spell-tauri.ts", () => ({ tauriSpellEngine: fakeEngine() }));
vi.mock("../../app/src/workspaces/editor/caret-centre.ts", async (actual) => {
  const real = await actual<typeof import("../../app/src/workspaces/editor/caret-centre.ts")>();
  return { ...real, centreCaretLine: vi.fn(real.centreCaretLine) };
});
const { centreCaretLine } = await import("../../app/src/workspaces/editor/caret-centre.ts");
const centred = vi.mocked(centreCaretLine);
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
let project: Project;
let shell: MountedShell | undefined;

beforeEach(async () => {
  temporary = temporaryDirectory();
  const source = join(temporary.path, "Brick-&-Steel.fountain");
  writeFileSync(source, readFixtureBytes("Brick-&-Steel.fountain"));
  project = (
    await importProject(
      { filesystem: nodeFilesystem, newProjectId: () => "5b1e0c2a-0000-4000-8000-0123456789ab" },
      { sourcePath: source, projectsDirectory: join(temporary.path, "write-ist") },
    )
  ).project;
  centred.mockClear();
});
afterEach(async () => {
  await shell?.unmount();
  shell = undefined;
  useKeyBindings({});
  document.body.replaceChildren();
  temporary.remove();
});

async function editing(place?: CaretPlace) {
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
    places: () => ({ recall: async () => place, remember: async () => {} }) as never,
    chooseCopyLocation: async () => undefined,
    choosePdfLocation: async () => undefined,
    openSettings: () => {},
    askToEditDetails: () => {},
  });
  await vi.waitFor(() => expect(into.querySelector(".ProseMirror")).not.toBeNull());
  const view = paper.view as EditorView;
  return { into, view };
}

const key = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const menuItem = (into: HTMLElement, label: string) =>
  [...into.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((item) => item.textContent?.startsWith(label))!;
const contextMenu = () => document.querySelector<HTMLElement>(".drop-menu--context");
const headingStarts = (view: EditorView): number[] => {
  const starts: number[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.attrs["type"] === "scene-heading") starts.push(offset + 1);
  });
  return starts;
};
/** Where a scene jump leaves the caret: the end of each heading's text. */
const headingEnds = (view: EditorView): number[] => {
  const ends: number[] = [];
  view.state.doc.forEach((node, offset) => {
    if (node.attrs["type"] === "scene-heading") ends.push(offset + 1 + node.content.size);
  });
  return ends;
};

/**
 * The window the paper scrolls in, with its scroll position watched: every
 * write to it is kept, because any write stops a glide running on it.
 */
function watchedScroller(view: EditorView) {
  const scroller = view.dom.parentElement!.parentElement!;
  scroller.style.overflowY = "auto";
  let top = 0;
  let left = 0;
  const writes: string[] = [];
  const glides: number[] = [];
  Object.defineProperties(scroller, {
    clientHeight: { value: 768 },
    clientWidth: { value: 1000 },
    scrollHeight: { value: 200_000 },
    scrollWidth: { value: 1000 },
    scrollTop: { get: () => top, set: (value: number) => (writes.push(`top=${value}`), (top = value)) },
    scrollLeft: { get: () => left, set: (value: number) => (writes.push(`left=${value}`), (left = value)) },
    scrollTo: {
      value: (options: ScrollToOptions) => {
        if (options.behavior === "smooth") glides.push(options.top!);
        else top = options.top!;
      },
    },
  });
  return { scroller, writes, glides };
}

describe("centring the caret's line", () => {
  it("puts the caret line in the middle, and stops at the top and the foot of the script", () => {
    const at = { viewTop: 0, viewHeight: 600, scrollHeight: 10_000 };
    expect(centredScrollTop({ ...at, caretTop: 2000, caretBottom: 2020, scrollTop: 1000 })).toBe(2710);
    expect(centredScrollTop({ ...at, caretTop: 100, caretBottom: 120, scrollTop: 0 })).toBe(0);
    expect(centredScrollTop({ ...at, caretTop: 590, caretBottom: 610, scrollTop: 9400 })).toBe(9400);
  });

  it("glides there smoothly, or at once when asked", async () => {
    const { view } = await editing();
    const scroller = view.dom.parentElement!.parentElement!;
    scroller.style.overflowY = "auto";
    const scrolls: ScrollToOptions[] = [];
    Object.defineProperties(scroller, {
      clientHeight: { value: 600 },
      scrollHeight: { value: 5000 },
      scrollTo: { value: (options: ScrollToOptions) => scrolls.push(options) },
    });
    centreCaretLine(view);
    centreCaretLine(view, { smooth: false });
    expect(scrolls.map((each) => each.behavior)).toEqual(["smooth", "auto"]);
    expect(scrolls[0]!.top).toBe(8);
  });

  it("with the measures real WebKit gave, at 164% zoom, centres the caret line", () => {
    // Big Fish at 1366 × 768, the paper at View ▸ Zoom's third step in (1.6446),
    // scrolled to 3000 and the twelfth scene chosen. The caret is measured in the
    // window's pixels, zoomed, and the scroll position in the window's own; both
    // engines give the zoomed paper's caret in window pixels, so no scale is
    // applied. Scrolled there, the caret line's middle was the window's (384).
    const measured = { caretTop: 12338.34375, caretBottom: 12368.34375, viewTop: 0, viewHeight: 768, scrollTop: 3000, scrollHeight: 217479 };
    expect(centredScrollTop(measured)).toBe(14969);
  });

  it("is not stopped by the paper being held centred across: no scroll position is written while it glides", async () => {
    // The cause of #162's jumps that moved a few lines: the Editor wrote the
    // sideways position on every scroll event, the value it already had, and
    // a write stops a smooth scroll where it is.
    const { into, view } = await editing();
    const { scroller, writes, glides } = watchedScroller(view);
    view.coordsAtPos = () => ({ left: 200, right: 200, top: 9000, bottom: 9016 });
    into.querySelectorAll<HTMLElement>(".panel__scene")[3]!.click();
    expect(glides).toHaveLength(1);
    scroller.dispatchEvent(new Event("scroll"));
    scroller.dispatchEvent(new Event("scroll"));
    expect(writes).toEqual([]);
  });

  it("is not undone by the caret's own scrolling, which stands aside until the glide is over", async () => {
    const { into, view } = await editing();
    const { scroller, writes, glides } = watchedScroller(view);
    // The caret far below the window, as it is the moment a jump is chosen.
    view.coordsAtPos = () => ({ left: 200, right: 200, top: 9000, bottom: 9016 });
    into.querySelectorAll<HTMLElement>(".panel__scene")[3]!.click();
    expect(glides).toEqual([9000 + 8 - 384]);
    // A transaction asking for the caret to be shown, mid-glide.
    view.dispatch(view.state.tr.scrollIntoView());
    expect(scrollCaretIntoView(view)).toBe(true);
    expect(writes).toEqual([]);
    // Once the window says it has stopped, the caret's own scrolling is back.
    scroller.dispatchEvent(new Event("scrollend"));
    scrollCaretIntoView(view);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^top=/);
  });

  it("is let go after a while even if the window never says it has stopped", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { into, view } = await editing();
      const { writes } = watchedScroller(view);
      view.coordsAtPos = () => ({ left: 200, right: 200, top: 9000, bottom: 9016 });
      into.querySelectorAll<HTMLElement>(".panel__scene")[3]!.click();
      scrollCaretIntoView(view);
      expect(writes).toEqual([]);
      vi.advanceTimersByTime(GLIDE_LIMIT_MS);
      scrollCaretIntoView(view);
      expect(writes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is used by Next and Previous Scene", async () => {
    const { view } = await editing();
    key(view.dom, { key: ">", ctrlKey: true });
    expect(centred).toHaveBeenCalledOnce();
    expect(view.state.selection.head).toBe(headingEnds(view)[1]);
    key(view.dom, { key: "<", ctrlKey: true });
    expect(centred).toHaveBeenCalledTimes(2);
  });

  it("is used by a scene chosen in the Scenes panel, which takes the caret to the end of its heading", async () => {
    const { into, view } = await editing();
    const scenes = [...into.querySelectorAll<HTMLElement>(".panel__scene")];
    scenes[2]!.click();
    expect(view.state.selection.head).toBe(headingEnds(view)[2]);
    expect(view.state.selection.$head.parent.textContent).toBe(scenes[2]!.textContent);
    expect(centred).toHaveBeenCalledOnce();
  });

  it("is used by a search result", async () => {
    const { into, view } = await editing();
    key(window, { key: "Enter", altKey: true });
    const query = into.querySelector<HTMLInputElement>(".search__query")!;
    query.value = "steel";
    query.dispatchEvent(new Event("input"));
    into.querySelector(".search__result")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(centred).toHaveBeenCalledOnce();
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to).toLowerCase()).toBe("steel");
  });

  it("leaves a search result selected on the paper as the window's own selection, which the paper's selection look paints", async () => {
    const { into } = await editing();
    key(window, { key: "Enter", altKey: true });
    const query = into.querySelector<HTMLInputElement>(".search__query")!;
    query.value = "steel";
    query.dispatchEvent(new Event("input"));
    into.querySelector(".search__result")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const selected = window.getSelection()!;
    expect(selected.toString().toLowerCase()).toBe("steel");
    expect(selected.anchorNode!.parentElement!.closest(".manuscript")).not.toBeNull();
  });

  it("is used, at once, when a project opens where the writer left it, and not when it opens at the top", async () => {
    const first = await editing();
    const place = caretPlaceOf(first.view.state.doc, headingStarts(first.view)[3]!)!;
    expect(centred).not.toHaveBeenCalled();
    await shell!.unmount();
    shell = undefined;
    document.body.replaceChildren();

    const { view } = await editing(place);
    expect(view.state.selection.head).toBe(headingStarts(view)[3]);
    expect(centred).toHaveBeenCalledOnce();
    expect(centred.mock.calls[0]![1]).toEqual({ smooth: false });
  });

  it("is not used by typing, Undo or Redo", async () => {
    const { into, view } = await editing();
    view.dispatch(view.state.tr.insertText("Rain. ").scrollIntoView());
    menuItem(into, "Undo").click();
    menuItem(into, "Redo").click();
    key(view.dom, { key: "z", ctrlKey: true });
    expect(centred).not.toHaveBeenCalled();
  });
});

describe("holding the paper centred across", () => {
  const drawn = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON: () => ({}) });
  function scene(sheetLeft: number, scrollWidth: number) {
    const scroller = document.createElement("div");
    const paper = document.createElement("div");
    let left = 0;
    const writes: number[] = [];
    Object.defineProperties(scroller, {
      clientWidth: { value: 1000 },
      scrollWidth: { value: scrollWidth },
      scrollLeft: { get: () => left, set: (value: number) => (writes.push(value), (left = value)) },
    });
    scroller.getBoundingClientRect = () => drawn(0, 1000);
    paper.getBoundingClientRect = () => drawn(sheetLeft - left, 800);
    return { scroller, paper, writes };
  }

  it("writes nothing when the paper is already centred, or can go no further", () => {
    const centred = scene(100, 1000);
    centrePaper(centred.paper, centred.scroller);
    expect(centred.writes).toEqual([]);
    // Off by a rounding, not a move.
    const nearly = scene(100.4, 1000);
    centrePaper(nearly.paper, nearly.scroller);
    expect(nearly.writes).toEqual([]);
    // Wanting to go further across than the window can, where it already is.
    const stuck = scene(300, 1000);
    centrePaper(stuck.paper, stuck.scroller);
    expect(stuck.writes).toEqual([]);
  });

  it("puts a paper moved across back in the middle", () => {
    const wide = scene(400, 1600);
    centrePaper(wide.paper, wide.scroller);
    expect(wide.writes).toEqual([300]);
  });
});

describe("Ctrl+Alt+Enter", () => {
  it("is a chord with both modifiers, named in full, and only with a named key (AltGr types characters)", () => {
    const press = (key: string, held: Partial<KeyPress> = {}): KeyPress => ({ key, altKey: false, ctrlKey: false, metaKey: false, ...held });
    const chord = commandById("context-menu")!.chord!;
    expect(chord).toEqual({ key: "Enter", mod: true, alt: true });
    expect(chordName(chord)).toBe("Ctrl + Alt + Enter");
    expect(chordMatches(chord, press("Enter", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(chordMatches(chord, press("Enter", { ctrlKey: true }))).toBe(false);
    expect(chordMatches(chord, press("Enter", { altKey: true }))).toBe(false);
    // Search (Alt+Enter) and New element (Ctrl+Enter) are not answered by it, nor it by them.
    expect(chordMatches({ key: "Enter", alt: true }, press("Enter", { ctrlKey: true, altKey: true }))).toBe(false);
    expect(chordMatches({ key: "Enter", mod: true }, press("Enter", { ctrlKey: true, altKey: true }))).toBe(false);

    expect(chordOf(press("Enter", { ctrlKey: true, altKey: true }))).toEqual({ key: "Enter", mod: true, alt: true });
    expect(chordOf(press("@", { ctrlKey: true, altKey: true }))).toBeUndefined();
    expect(keyBindingOf({ key: "Enter", mod: true, alt: true })).toEqual({ key: "Enter", mod: true, alt: true });
    expect(keyBindingOf({ key: "q", mod: true, alt: true })).toBeUndefined();
  });

  it("is listed in Settings ▸ Hotkeys as a key the writer can change, and in Ctrl+K under Writing", () => {
    expect(shortcutCommands().find((command) => command.id === "context-menu")).toEqual({
      id: "context-menu",
      label: "Right-Click Menu",
      defaults: [{ key: "Enter", mod: true, alt: true }],
      fixed: false,
    });
    const writing = shortcutGroups().find((group) => group.name === "Writing")!;
    expect(writing.rows).toContainEqual({ label: "Right-Click Menu", hints: ["[Ctrl + Alt + Enter]"] });
  });

  it("opens the paper's right-click menu at the caret, first item lit, as the Menu key does", async () => {
    const { view } = await editing();
    const before = view.state.doc;
    expect(key(view.dom, { key: "Enter", ctrlKey: true, altKey: true }).defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(contextMenu()).not.toBeNull());
    expect(contextMenu()!.style.getPropertyValue("--menu-x")).toBe("200");
    expect(contextMenu()!.style.getPropertyValue("--menu-y")).toBe("316");
    expect(document.activeElement?.getAttribute("role")).toBe("menuitem");
    expect(contextMenu()!.contains(document.activeElement)).toBe(true);
    // Nothing was typed and no line was made.
    expect(view.state.doc.eq(before)).toBe(true);
  });

  it("opens on the writer's own key instead, once they change it", async () => {
    useKeyBindings({ "context-menu": [{ key: "F9", mod: true }] });
    const { view } = await editing();
    const lines = view.state.doc.childCount;
    key(view.dom, { key: "Enter", ctrlKey: true, altKey: true });
    await new Promise((settled) => setTimeout(settled, 20));
    expect(contextMenu()).toBeNull();
    expect(view.state.doc.childCount).toBe(lines);
    key(view.dom, { key: "F9", ctrlKey: true });
    await vi.waitFor(() => expect(contextMenu()).not.toBeNull());
  });
});
