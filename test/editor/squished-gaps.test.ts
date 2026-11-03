/**
 * Squishing and restoring a gap from the keyboard, with no window (ADR-0038).
 *
 * Backspace with the caret at the very start of the lower element of a
 * squishable pair squishes the gap — no text moves. Enter with the caret at the
 * very end of the upper element of a squished pair restores it — no element is
 * made and the caret stays. Both are one undo step. Fountain in, keys, Fountain
 * out, with the type of every element beside the bytes.
 */
import { describe, expect, it } from "vitest";
import { undo } from "prosemirror-history";
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { joinBackwards, splitElement } from "../../src/screenplay/element-keys.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

const opened = (fountain: string): EditorState => editorStateFor(parse(fountain));
const saved = (state: EditorState): string => serialise(manuscriptOf(state.doc));
const types = (state: EditorState): string[] => manuscriptOf(state.doc).elements.map((e) => e.type);
const texts = (state: EditorState): string[] => manuscriptOf(state.doc).elements.map((e) => e.text);

function caretAt(state: EditorState, element: number, offset: number): EditorState {
  const at = startOfElement(state, element) + offset;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

/** Press a key's command, as the window would; `undefined` when the key is left to the browser. */
function press(state: EditorState, command: Command): EditorState | undefined {
  let next: EditorState | undefined;
  const handled = command(state, (tr) => {
    next = state.apply(tr);
  });
  return handled && next !== undefined ? next : handled ? state : undefined;
}

const caretOffset = (state: EditorState): number => state.selection.from;

describe("Backspace at the start of the lower element of a squishable pair", () => {
  it("squishes the gap and merges nothing", () => {
    const before = caretAt(opened("One.\n\nTwo."), 1, 0);
    const after = press(before, joinBackwards)!;

    expect(saved(after)).toBe("One.\nTwo.");
    expect(types(after)).toEqual(["action", "action"]);
    expect(texts(after)).toEqual(["One.", "Two."]);
    expect(caretOffset(after)).toBe(startOfElement(after, 1));
  });

  it("squishes a centered pair too", () => {
    const after = press(caretAt(opened(">ONE<\n\n>TWO<"), 1, 0), joinBackwards)!;
    expect(saved(after)).toBe(">ONE<\n>TWO<");
  });

  it("takes the gap back in one undo step", () => {
    const squished = press(caretAt(opened("One.\n\nTwo."), 1, 0), joinBackwards)!;
    let undone = squished;
    undo(squished, (tr) => {
      undone = squished.apply(tr);
    });
    expect(saved(undone)).toBe("One.\n\nTwo.");
    expect(texts(undone)).toEqual(["One.", "Two."]);
  });

  it("merges the text as before when the gap is already squished", () => {
    const after = press(caretAt(opened("One.\nTwo."), 1, 0), joinBackwards)!;
    expect(texts(after)).toEqual(["One.Two."]);
  });

  it("merges as before in a pair the table does not let you squish", () => {
    const after = press(caretAt(opened("MARY\nHello.\n\nHe goes."), 2, 0), joinBackwards)!;
    expect(saved(after)).toBe("MARY\nHello.He goes.");
  });

  it("does nothing special away from the start of the element", () => {
    expect(press(caretAt(opened("One.\n\nTwo."), 1, 2), joinBackwards)).toBeUndefined();
  });

  it("deletes an empty element as before rather than squishing", () => {
    const withEmpty = press(caretAt(opened("One."), 0, 4), splitElement)!;
    expect(types(withEmpty)).toEqual(["action"]);
    const state = caretAt(withEmpty, 1, 0);
    expect(state.doc.lastChild!.childCount).toBe(0);
    const after = press(state, joinBackwards)!;
    expect(after.doc.childCount).toBe(1);
  });
});

describe("Enter at the end of the upper element of a squished pair", () => {
  it("restores the gap, makes no element, and leaves the caret where it was", () => {
    const before = caretAt(opened("One.\nTwo."), 0, 4);
    const after = press(before, splitElement)!;

    expect(saved(after)).toBe("One.\n\nTwo.");
    expect(types(after)).toEqual(["action", "action"]);
    expect(after.doc.childCount).toBe(before.doc.childCount);
    expect(caretOffset(after)).toBe(caretOffset(before));
  });

  it("restores a centered pair", () => {
    const after = press(caretAt(opened(">ONE<\n>TWO<"), 0, 3), splitElement)!;
    expect(saved(after)).toBe(">ONE<\n\n>TWO<");
  });

  it("takes only the gap under the caret, in a run of three", () => {
    const after = press(caretAt(opened("One.\nTwo.\nThree."), 0, 4), splitElement)!;
    expect(saved(after)).toBe("One.\n\nTwo.\nThree.");
  });

  it("squishes the gap again in one undo step", () => {
    const restored = press(caretAt(opened("One.\nTwo."), 0, 4), splitElement)!;
    let undone = restored;
    undo(restored, (tr) => {
      undone = restored.apply(tr);
    });
    expect(saved(undone)).toBe("One.\nTwo.");
  });

  it("makes a new element as before when the gap is not squished", () => {
    const after = press(caretAt(opened("One.\n\nTwo."), 0, 4), splitElement)!;
    expect(after.doc.childCount).toBe(3);
  });

  it("makes a new element as before when the caret is not at the end", () => {
    const after = press(caretAt(opened("One.\nTwo."), 0, 2), splitElement)!;
    expect(after.doc.childCount).toBe(3);
    expect(texts(after)).toEqual(["On", "e.", "Two."]);
  });

  it("does not hand the squish on to the new element made at the end of the lower one", () => {
    const after = press(caretAt(opened("One.\nTwo."), 1, 4), splitElement)!;
    expect(after.doc.childCount).toBe(3);
    expect(after.doc.child(2).attrs["squished"]).toBe(false);
  });

  it("does not hand the squish on to the second half of a split line", () => {
    const after = press(caretAt(opened("One.\nTwo."), 1, 2), splitElement)!;
    expect(after.doc.child(1).attrs["squished"]).toBe(true);
    expect(after.doc.child(2).attrs["squished"]).toBe(false);
  });

  it("keeps the squish on the text that was under it when Enter opens a line above", () => {
    const after = press(caretAt(opened("One.\nTwo."), 1, 0), splitElement)!;
    expect(after.doc.childCount).toBe(3);
    expect(after.doc.child(1).attrs["squished"]).toBe(true);
    expect(after.doc.child(2).attrs["squished"]).toBe(false);
  });
});
