/**
 * Capitals and `(CONT'D)` look after themselves, with no window (#44, seam 2).
 *
 * Fountain in, keys applied, Fountain out — with the element types beside the
 * bytes, because the bytes alone cannot see a misread element (ADR-0021).
 */
import { describe, expect, it } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { cycleType, splitElement } from "../../src/screenplay/element-keys.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import type { ElementType } from "../../src/screenplay/document.ts";
import { startOfElement } from "../support/editor-positions.ts";

function opened(fountain: string): EditorState {
  return editorStateFor(parse(fountain));
}
function saved(state: EditorState): string {
  return serialise(manuscriptOf(state.doc));
}
function types(state: EditorState): readonly ElementType[] {
  return manuscriptOf(state.doc).elements.map((element) => element.type);
}
function type(state: EditorState, element: number, offset: number, text: string): EditorState {
  return state.apply(state.tr.insertText(text, startOfElement(state, element) + offset));
}
function remove(state: EditorState, element: number, from: number, to: number): EditorState {
  const start = startOfElement(state, element);
  return state.apply(state.tr.delete(start + from, start + to));
}
/** Put the caret `offset` into an element. */
function caretAt(state: EditorState, element: number, offset: number): EditorState {
  const at = startOfElement(state, element) + offset;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}
/** Run a command, as a key does. */
function press(state: EditorState, command: typeof cycleType): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}
/** The caret at the end of an element, then the command. */
function pressAtEnd(state: EditorState, element: number, command: typeof cycleType): EditorState {
  const text = manuscriptOf(state.doc).elements[element]!.text;
  return press(caretAt(state, element, text.length), command);
}

describe("capitals as the writer types", () => {
  const SCENE = "INT. KITCHEN - DAY\n\nMary makes toast.\n\nMARY\nMorning.\n\n> FADE OUT.";

  it("capitalises lowercase typed into a scene heading", () => {
    const state = type(opened(SCENE), 0, 18, " - later");
    expect(saved(state)).toBe(SCENE.replace("DAY", "DAY - LATER"));
    expect(types(state)[0]).toBe("scene-heading");
  });

  it("capitalises lowercase typed into a character cue", () => {
    const state = type(opened(SCENE), 2, 4, "ie");
    expect(saved(state)).toBe(SCENE.replace("MARY\n", "MARYIE\n"));
    expect(types(state)[2]).toBe("character");
  });

  it("capitalises lowercase typed into a transition, and keeps it capitals", () => {
    // The forced transition's text is " FADE OUT." — its leading space is the writer's.
    const state = type(type(opened(SCENE), 4, 10, " quick"), 4, 0, "x");
    expect(saved(state)).toBe(SCENE.replace("> FADE OUT.", ">X FADE OUT. QUICK"));
    expect(types(state)[4]).toBe("transition");
  });

  it("leaves action and dialogue as typed", () => {
    const state = type(type(opened(SCENE), 1, 5, "slowly "), 3, 0, "oh, ");
    expect(saved(state)).toBe(
      SCENE.replace("Mary makes", "Mary slowly makes").replace("Morning", "oh, Morning"),
    );
  });

  it("capitalises the text already there when a line is tabbed into a cue", () => {
    // action → character
    const state = pressAtEnd(opened("Mary Makes toast."), 0, cycleType);
    expect(manuscriptOf(state.doc).elements[0]!.text).toBe("MARY MAKES TOAST.");
    expect(types(state)).toEqual(["character"]);
  });

  it("capitalises when tabbed into a scene heading and a transition", () => {
    const heading = opened("not quite a scene\n\nmary");
    expect(types(heading)).toEqual(["action", "action"]);
    const cue = pressAtEnd(heading, 0, cycleType);
    expect(types(cue)[0]).toBe("character");
    // Tab round the cycle from the character cue: dialogue, parenthetical, transition.
    let around = cue;
    for (let i = 0; i < 3; i++) around = pressAtEnd(around, 0, cycleType);
    expect(types(around)[0]).toBe("transition");
    expect(manuscriptOf(around.doc).elements[0]!.text).toBe("NOT QUITE A SCENE");
    // and on to a scene heading
    around = pressAtEnd(around, 0, cycleType);
    expect(types(around)[0]).toBe("scene-heading");
    expect(manuscriptOf(around.doc).elements[0]!.text).toBe("NOT QUITE A SCENE");
  });

  it("does not lowercase when tabbing away from a capitals type", () => {
    const state = pressAtEnd(opened("EDWARD\nHello."), 0, cycleType);
    expect(types(state)[0]).toBe("dialogue");
    expect(manuscriptOf(state.doc).elements[0]!.text).toBe("EDWARD");
  });

  it("leaves a lowercase forced cue as it is on import and save (ADR-0020)", () => {
    const fountain = "INT. ROOM - DAY\n\n@edward\nHello.";
    const state = opened(fountain);
    expect(types(state)).toEqual(["scene-heading", "character", "dialogue"]);
    expect(saved(state)).toBe(fountain);
  });
});

describe("(CONT'D) is written when the writer moves from the cue to the dialogue (ADR-0026)", () => {
  const INTERRUPTED = "INT. ROOM - DAY\n\nEDWARD\nHello.\n\nThe door slams.\n\n";

  it("does not write it while the cue is typed", () => {
    const state = type(opened(`${INTERRUPTED}@EDWAR`), 4, 5, "d");
    expect(saved(state)).toBe(`${INTERRUPTED}@EDWARD`);
    expect(types(state)[4]).toBe("character");
  });

  it("writes it on Enter from the cue to its dialogue, and not before", () => {
    let state = opened(`${INTERRUPTED}@EDWAR`);
    state = type(state, 4, 5, "d");
    expect(saved(state)).not.toContain("(CONT'D)");
    state = pressAtEnd(state, 4, splitElement);
    expect(saved(state)).toBe(`${INTERRUPTED}@EDWARD (CONT'D)`);
    // The dialogue the caret stands in is empty, and a blank line is not saved.
    expect(types(state)).toEqual(["scene-heading", "character", "dialogue", "action", "character"]);
    expect(state.doc.lastChild!.attrs["type"]).toBe("dialogue");
  });

  it("writes it with the dialogue, after the extension already there", () => {
    let state = opened(`${INTERRUPTED}@EDWARD (V.O.)`);
    state = pressAtEnd(state, 4, splitElement);
    state = type(state, 5, 0, "Again.");
    expect(saved(state)).toBe(`${INTERRUPTED}@EDWARD (V.O.) (CONT'D)\nAgain.`);
    expect(types(state)).toEqual([
      "scene-heading",
      "character",
      "dialogue",
      "action",
      "character",
      "dialogue",
    ]);
  });

  it("writes a tabbed-in cue capitalised, with its continuation", () => {
    let state = opened(`${INTERRUPTED}edward`);
    state = pressAtEnd(state, 4, cycleType); // action → character
    state = pressAtEnd(state, 4, splitElement);
    expect(manuscriptOf(state.doc).elements[4]!.text).toBe("EDWARD (CONT'D)");
  });

  it("does not write it when the same character simply goes on speaking", () => {
    let state = opened("INT. ROOM - DAY\n\nEDWARD\nHello.");
    state = type(state, 2, 6, " there");
    expect(saved(state)).toBe("INT. ROOM - DAY\n\nEDWARD\nHello. there");
  });

  it("puts it back when it is deleted from a cue that still needs it", () => {
    const fountain = `${INTERRUPTED}EDWARD (CONT'D)\nAgain.`;
    const state = remove(opened(fountain), 4, 6, 15);
    expect(saved(state)).toBe(fountain);
  });

  it("puts it back when the caret leaves the cue it was deleted in", () => {
    const fountain = `${INTERRUPTED}EDWARD (CONT'D)\nAgain.`;
    let state = caretAt(opened(fountain), 4, 15);
    state = state.apply(state.tr.delete(state.selection.from - 9, state.selection.from));
    expect(saved(state)).toBe(`${INTERRUPTED}EDWARD\nAgain.`); // still in the cue: left alone
    state = caretAt(state, 5, 0);
    expect(saved(state)).toBe(fountain);
  });

  it("puts it back after the extension when only the extension and CONT'D are deleted", () => {
    const fountain = `${INTERRUPTED}EDWARD (V.O.) (CONT'D)\nAgain.`;
    expect(saved(remove(opened(fountain), 4, 13, 22))).toBe(fountain);
    // Leaving the space behind does not double it.
    expect(saved(remove(opened(fountain), 4, 14, 22))).toBe(fountain);
  });

  it("adds it after (V.O.), (O.S.) and any other extension, and changes none of them", () => {
    for (const extension of ["(V.O.)", "(O.S.)", "(PRE-LAP)"]) {
      const state = type(opened(`${INTERRUPTED}EDWARD ${extension}\nAgain.`), 5, 6, " more");
      expect(saved(state)).toBe(`${INTERRUPTED}EDWARD ${extension} (CONT'D)\nAgain. more`);
    }
  });

  it("leaves an extension the writer removes removed, and one they type in place", () => {
    const fountain = `${INTERRUPTED}EDWARD (V.O.) (CONT'D)\nAgain.`;
    const state = remove(opened(fountain), 4, 6, 13); // " (V.O.)"
    expect(saved(state)).toBe(`${INTERRUPTED}EDWARD (CONT'D)\nAgain.`);
    const typed = type(opened(`${INTERRUPTED}EDWARD (CONT'D)\nAgain.`), 5, 6, " now");
    expect(saved(typed)).toBe(`${INTERRUPTED}EDWARD (CONT'D)\nAgain. now`);
  });

  it("does not resume across a scene heading", () => {
    const state = type(opened("EDWARD\nHi.\n\nINT. ROOM - DAY\n\nEDWARD\nHello."), 4, 6, "!");
    expect(saved(state)).toBe("EDWARD\nHi.\n\nINT. ROOM - DAY\n\nEDWARD\nHello.!");
  });
});
