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

  it("is used by Next and Previous Scene", async () => {
    const { view } = await editing();
    key(view.dom, { key: ">", ctrlKey: true });
    expect(centred).toHaveBeenCalledOnce();
    expect(view.state.selection.head).toBe(headingStarts(view)[1]);
    key(view.dom, { key: "<", ctrlKey: true });
    expect(centred).toHaveBeenCalledTimes(2);
  });

  it("is used by a scene chosen in the Scenes panel, which takes the caret to its heading", async () => {
    const { into, view } = await editing();
    const scenes = [...into.querySelectorAll<HTMLElement>(".panel__scene")];
    scenes[2]!.click();
    expect(view.state.selection.head).toBe(headingStarts(view)[2]);
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

  it("is listed in Settings ▸ Keyboard Shortcuts as a key the writer can change, and in Ctrl+K under Writing", () => {
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
