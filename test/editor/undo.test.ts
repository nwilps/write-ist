/**
 * Undo and redo, with no window (#45, seam 2).
 *
 * Fountain in, what a writer does (typing, Enter, Tab, undo, redo), Fountain
 * out — and the type of every element beside it, because the bytes alone
 * cannot see a misread element. Nothing here looks inside the history plugin:
 * a step is whatever one undo takes back.
 */
import { describe, expect, it } from "vitest";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { undo, redo } from "prosemirror-history";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { cycleType, joinBackwards, splitElement } from "../../src/screenplay/element-keys.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import type { ElementType } from "../../src/screenplay/document.ts";

const FOUNTAIN = "INT. KITCHEN - DAY\n\nHe waits.\n";

const saved = (state: EditorState): string => serialise(manuscriptOf(state.doc));
const types = (state: EditorState): readonly ElementType[] =>
  manuscriptOf(state.doc).elements.map((element) => element.type);

/** Where a keystroke at `at` ms (since the file opened) lands. */
function typeAt(state: EditorState, element: number, offset: number, text: string, at: number) {
  const tr = state.tr.insertText(text, startOfElement(state, element) + offset);
  return state.apply(tr.setTime(at));
}

/** Put the caret in an element, `offset` characters in. */
function caret(state: EditorState, element: number, offset: number): EditorState {
  const at = startOfElement(state, element) + offset;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

/** Run a command the way the window would, returning the state it leaves. */
function run(state: EditorState, command: Command, at = 0): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(at === 0 ? tr : tr.setTime(at));
  });
  return next;
}

/** The state after a command that is expected to dispatch more than once. */
function runAll(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = next.apply(tr);
  });
  return next;
}

const opened = () => editorStateFor(parse(FOUNTAIN));

describe("undo and redo (#45)", () => {
  it("takes consecutive typing back in one step", () => {
    let state = opened();
    state = typeAt(state, 1, 9, " a", 1000);
    state = typeAt(state, 1, 11, " b", 1100);
    state = typeAt(state, 1, 13, " c", 1200);
    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nHe waits. a b c\n");

    state = run(state, undo);
    expect(saved(state)).toBe(FOUNTAIN);
    expect(types(state)).toEqual(["scene-heading", "action"]);
    // Nothing left to undo.
    expect(undo(state)).toBe(false);
  });

  it("begins a new step after a pause in typing", () => {
    let state = opened();
    state = typeAt(state, 1, 9, " a", 1000);
    state = typeAt(state, 1, 11, " b", 1100);
    state = typeAt(state, 1, 13, " c", 5000);

    state = run(state, undo);
    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nHe waits. a b\n");
    state = run(state, undo);
    expect(saved(state)).toBe(FOUNTAIN);
  });

  it("makes Enter at the end of a line a step of its own", () => {
    let state = caret(opened(), 1, 9);
    state = typeAt(state, 1, 9, " a", 1000);
    state = runAll(state, splitElement);
    // The new line is empty, so the file leaves it out until it has words.
    expect(state.doc.childCount).toBe(3);
    const start = startOfElement(state, 2);
    state = state.apply(state.tr.insertText("Then.", start).setTime(1100));
    expect(saved(state)).toContain("He waits. a\n\nThen.");

    // Typing after the split is its own step, not folded into the split.
    state = run(state, undo);
    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nHe waits. a\n");
    state = run(state, undo);
    expect(state.doc.childCount).toBe(2);
    expect(types(state)).toEqual(["scene-heading", "action"]);
    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nHe waits. a\n");
    state = run(state, undo);
    expect(saved(state)).toBe(FOUNTAIN);
  });

  it("makes Tab a step of its own, and undoing it restores the type", () => {
    let state = caret(opened(), 1, 0);
    state = runAll(state, cycleType);
    expect(types(state)).toEqual(["scene-heading", "character"]);

    state = run(state, undo);
    expect(types(state)).toEqual(["scene-heading", "action"]);
    expect(saved(state)).toBe(FOUNTAIN);
    state = run(state, redo);
    expect(types(state)).toEqual(["scene-heading", "character"]);
  });

  it("makes a join a step of its own", () => {
    let state = caret(opened(), 1, 0);
    state = runAll(state, joinBackwards);
    expect(types(state)).toEqual(["scene-heading"]);

    state = run(state, undo);
    expect(types(state)).toEqual(["scene-heading", "action"]);
    expect(saved(state)).toBe(FOUNTAIN);
  });

  it("returns to the opened bytes undoing everything, and back redoing everything", () => {
    let state = caret(opened(), 1, 9);
    state = typeAt(state, 1, 9, " a", 1000);
    state = runAll(state, splitElement);
    state = state.apply(state.tr.insertText("Then", startOfElement(state, 2)).setTime(1100));
    state = runAll(caret(state, 2, 4), cycleType);
    state = typeAt(state, 2, 4, "!", 9000);
    const edited = saved(state);
    const editedTypes = types(state);
    expect(editedTypes).toEqual(["scene-heading", "action", "character"]);

    while (undo(state)) state = run(state, undo);
    expect(saved(state)).toBe(FOUNTAIN);
    expect(types(state)).toEqual(["scene-heading", "action"]);

    while (redo(state)) state = run(state, redo);
    expect(saved(state)).toBe(edited);
    expect(types(state)).toEqual(editedTypes);
  });
});
