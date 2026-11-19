/**
 * Previous Scene and Next Scene: Ctrl+< and Ctrl+> (Ctrl+, and Ctrl+. without
 * Shift) put the caret at the start of a scene heading, the ones the Scenes
 * list shows, and ask for the caret to be scrolled into view.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { commandById, commandForKey, hintOf, runCommand, type CommandHost } from "../../app/src/workspaces/editor/commands.ts";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { readFixtureText } from "../support/files.ts";
import { startOfElement } from "../support/editor-positions.ts";

// jsdom lays nothing out, so the scroll itself is not here: what is checked is that it is asked for.
const scrolled = vi.hoisted(() => vi.fn(() => true));
vi.mock("../../app/src/workspaces/editor/caret-margin.ts", () => ({ scrollCaretIntoView: scrolled }));
const { sceneHeadings } = await import("../../app/src/workspaces/editor/scene-jump.ts");

/** An invented script: a title page, action before the first heading, and three scenes. */
const SCRIPT = [
  "Title: The Kettle",
  "",
  "A cold kitchen.",
  "",
  "INT. KITCHEN - DAY",
  "",
  "MAVIS fills the kettle.",
  "",
  "EXT. GARDEN - DAY",
  "",
  "Rain on the shed.",
  "",
  "INT. SHED - NIGHT",
  "",
  "MAVIS",
  "Who left the light on?",
  "",
].join("\n");

/** Elements by index: 0 action, 1 heading, 2 action, 3 heading, 4 action, 5 heading, 6 cue, 7 dialogue. */
const HEADINGS = [1, 3, 5];

/** A view-shaped stand-in: the command reads `state`, `dispatch` and `focus`. */
function editing(text: string) {
  let state: EditorState = editorStateFor(parse(text));
  const view = {
    get state() {
      return state;
    },
    dispatch: (tr: Parameters<EditorState["apply"]>[0]) => {
      state = state.apply(tr);
    },
    focus: vi.fn(),
  } as unknown as EditorView;
  const host = { view: () => view } as unknown as CommandHost;
  const caretAt = (at: number): void => view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)));
  const caret = (): number => state.selection.head;
  const element = (index: number): number => startOfElement(state, index);
  return { view, host, caretAt, caret, element, state: () => state };
}

const ctrl = (key: string, shift = false) => ({ key, ctrlKey: true, altKey: false, metaKey: false, shiftKey: shift });

/** Press a key on the paper, as the Editor's key handler asks the table. */
function press(host: CommandHost, key: ReturnType<typeof ctrl>): void {
  const command = commandForKey(key, "editor");
  if (command === undefined) throw new Error(`nothing answers ${key.key}`);
  runCommand(command, host);
}

describe("the keys", () => {
  it("are Ctrl+< for Previous Scene and Ctrl+> for Next Scene, with or without Shift, and Cmd on a Mac", () => {
    for (const key of ["<", ","]) {
      expect(commandForKey(ctrl(key), "editor")?.id, key).toBe("previous-scene");
      expect(commandForKey(ctrl(key, true), "editor")?.id, key).toBe("previous-scene");
      expect(commandForKey({ ...ctrl(key), ctrlKey: false, metaKey: true }, "editor")?.id, key).toBe("previous-scene");
    }
    for (const key of [">", "."]) {
      expect(commandForKey(ctrl(key), "editor")?.id, key).toBe("next-scene");
      expect(commandForKey(ctrl(key, true), "editor")?.id, key).toBe("next-scene");
    }
  });

  it("are the paper's, and never a bare , . < or >, which is the writer typing", () => {
    for (const key of ["<", ",", ">", "."]) {
      expect(commandForKey({ ...ctrl(key), ctrlKey: false }, "editor"), key).toBeUndefined();
      expect(commandForKey(ctrl(key), "window"), key).toBeUndefined();
    }
  });

  it("are shown as [Ctrl + <] and [Ctrl + >]", () => {
    expect(hintOf(commandById("previous-scene")!)).toBe("[Ctrl + <]");
    expect(hintOf(commandById("next-scene")!)).toBe("[Ctrl + >]");
  });

  it("leave the zoom keys to zoom", () => {
    for (const key of ["=", "+", "Add", "-", "Subtract", "0"]) {
      const command = commandForKey(ctrl(key), "window");
      expect(command?.id, key).toMatch(/zoom/);
    }
    const scenes = [commandById("previous-scene")!, commandById("next-scene")!];
    const keys = scenes.flatMap((command) => [command.chord!.key, ...(command.chord!.alsoKeys ?? [])]);
    expect(keys).toEqual(["<", ",", ">", "."]);
  });
});

describe("Next Scene", () => {
  it("goes from before the first heading to the first, then on to each, to the start of its heading", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(0) + 3);
    for (const heading of HEADINGS) {
      press(script.host, ctrl("."));
      expect(script.caret()).toBe(script.element(heading));
    }
  });

  it("goes from inside a heading's own text to the next heading", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(3) + 4);
    press(script.host, ctrl(">", true));
    expect(script.caret()).toBe(script.element(5));
  });

  it("does nothing in the last scene: no move, no scroll, no wrap", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(7) + 2);
    scrolled.mockClear();
    press(script.host, ctrl("."));
    expect(script.caret()).toBe(script.element(7) + 2);
    expect(scrolled).not.toHaveBeenCalled();
  });

  it("asks for the caret to be scrolled into view, with the paper focused", () => {
    const script = editing(SCRIPT);
    scrolled.mockClear();
    press(script.host, ctrl("."));
    expect(scrolled).toHaveBeenCalledOnce();
    expect(scrolled).toHaveBeenCalledWith(script.view);
    expect(script.view.focus).toHaveBeenCalled();
  });
});

describe("Previous Scene", () => {
  it("goes from inside a scene to that scene's own heading first", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(4) + 5);
    press(script.host, ctrl(","));
    expect(script.caret()).toBe(script.element(3));
  });

  it("goes from the middle of a heading to its start", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(5) + 3);
    press(script.host, ctrl("<", true));
    expect(script.caret()).toBe(script.element(5));
  });

  it("goes from the start of a heading to the heading before it, back to the first", () => {
    const script = editing(SCRIPT);
    script.caretAt(script.element(5));
    press(script.host, ctrl(","));
    expect(script.caret()).toBe(script.element(3));
    press(script.host, ctrl(","));
    expect(script.caret()).toBe(script.element(1));
  });

  it("does nothing at the first heading, or before it: no move, no scroll, no wrap", () => {
    const script = editing(SCRIPT);
    for (const at of [script.element(1), script.element(0) + 2]) {
      script.caretAt(at);
      scrolled.mockClear();
      press(script.host, ctrl(","));
      expect(script.caret()).toBe(at);
      expect(scrolled).not.toHaveBeenCalled();
    }
  });

  it("does nothing before the manuscript has been read", () => {
    expect(() => runCommand(commandById("previous-scene")!, { view: () => undefined } as unknown as CommandHost)).not.toThrow();
  });
});

describe("on Big Fish", () => {
  it("visits every heading the Scenes list shows, in order, and back again", () => {
    const script = editing(readFixtureText("Big-Fish.fountain"));
    const headings = sceneHeadings(script.state().doc);
    // The census: every scene heading the parser reads in the file.
    const census = parse(readFixtureText("Big-Fish.fountain")).elements.filter((line) => line.type === "scene-heading");
    expect(headings.length).toBe(census.length);
    expect(headings.length).toBeGreaterThan(10);

    // From the start of the first element, which is not a heading.
    expect(script.state().doc.nodeAt(script.element(0) - 1)?.attrs["type"]).not.toBe("scene-heading");
    script.caretAt(script.element(0));
    const forward: string[] = [];
    for (let step = 0; step < headings.length + 2; step++) {
      const before = script.caret();
      press(script.host, ctrl("."));
      if (script.caret() === before) break;
      const there = script.state().selection.$head;
      expect(there.parentOffset).toBe(0);
      expect(there.parent.attrs["type"]).toBe("scene-heading");
      forward.push(there.parent.textContent);
    }
    expect(forward).toEqual(headings.map((heading) => heading.text));

    const back: string[] = [];
    for (let step = 0; step < headings.length + 2; step++) {
      const before = script.caret();
      press(script.host, ctrl(","));
      if (script.caret() === before) break;
      back.push(script.state().selection.$head.parent.textContent);
    }
    expect(back).toEqual(headings.map((heading) => heading.text).reverse().slice(1));
  });
});
