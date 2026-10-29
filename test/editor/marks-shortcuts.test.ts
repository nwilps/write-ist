/**
 * Bold, italic and underline from the keyboard, with no window (#46, seam 2).
 *
 * Fountain in, the mark toggle applied the way the keymap does, Fountain out —
 * with the element census beside the bytes. The keymap itself is Mod-b / Mod-i
 * / Mod-u wired in `editorStateFor`; these tests call the same `toggleMark`
 * commands that keymap binds (no window, no KeyboardEvent).
 */
import { describe, expect, it } from "vitest";
import { toggleMark } from "prosemirror-commands";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { screenplaySchema } from "../../src/screenplay/schema.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

function opened(fountain: string): EditorState {
  return editorStateFor(parse(fountain));
}
function saved(state: EditorState): string {
  return serialise(manuscriptOf(state.doc));
}
function types(state: EditorState): readonly string[] {
  return manuscriptOf(state.doc).elements.map((element) => element.type);
}

/** Select from an offset in one element to an offset in another (or a caret). */
function select(
  state: EditorState,
  from: readonly [number, number],
  to: readonly [number, number] = from,
): EditorState {
  const a = startOfElement(state, from[0]) + from[1];
  const b = startOfElement(state, to[0]) + to[1];
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, a, b)));
}

/** Run a command the way the window would. */
function run(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

const bold = toggleMark(screenplaySchema.marks["bold"]!);
const italic = toggleMark(screenplaySchema.marks["italic"]!);
const underline = toggleMark(screenplaySchema.marks["underline"]!);

/** "Mary makes toast." — toast is [11,16], makes is [5,10], full line [0,17]. */
const ACTION = "Mary makes toast.\n";

describe("toggling a mark over a selection", () => {
  it.each([
    ["bold", bold, "**toast**"],
    ["italic", italic, "*toast*"],
    ["underline", underline, "_toast_"],
  ] as const)("%s marks the word and a second press clears it", (_name, command, written) => {
    const start = select(opened(ACTION), [0, 11], [0, 16]);
    const on = run(start, command);
    expect(saved(on)).toBe(`Mary makes ${written}.\n`);
    expect(saved(run(on, command))).toBe(ACTION);
  });
});

describe("a selection across elements", () => {
  it("marks the covered slice of each, each with its own delimiters", () => {
    const state = opened("Mary makes toast.\n\nJohn eats it.\n\nThe end.\n");
    const on = run(select(state, [0, 5], [2, 3]), italic);
    expect(saved(on)).toBe("Mary *makes toast.*\n\n*John eats it.*\n\n*The* end.\n");
    expect(types(on)).toEqual(types(state));
  });
});

describe("overlapping marks", () => {
  it("nest underline outermost whichever was applied first", () => {
    const base = opened(ACTION);
    const boldFirst = run(run(select(base, [0, 11], [0, 16]), bold), underline);
    const underFirst = run(run(select(base, [0, 11], [0, 16]), underline), bold);
    expect(saved(boldFirst)).toBe("Mary makes _**toast**_.\n");
    expect(saved(underFirst)).toBe("Mary makes _**toast**_.\n");
  });

  it("underlining a wider range around a bold word keeps underline outermost", () => {
    const bolded = run(select(opened(ACTION), [0, 5], [0, 10]), bold);
    const both = run(select(bolded, [0, 0], [0, 17]), underline);
    // One underline span wrapping the line; bold stays on "makes" inside it.
    expect(saved(both)).toBe("_Mary **makes** toast._\n");
  });
});

describe("a caret", () => {
  it("sets the mark for what is typed next", () => {
    const caret = run(select(opened(ACTION), [0, 17]), italic);
    const typed = caret.apply(caret.tr.insertText(" Yum"));
    expect(saved(typed)).toBe("Mary makes toast.* Yum*\n");
  });
});
