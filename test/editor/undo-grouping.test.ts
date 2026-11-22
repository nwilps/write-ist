/**
 * Where one undo step ends and the next begins (`undo-grouping.ts`): a phrase,
 * not half a second. With no window, on an invented scene.
 *
 * Every keystroke is its own transaction, as in the window, a tenth of a second
 * apart unless a test says otherwise. A step is whatever one undo takes back.
 */
import { describe, expect, it } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import { redo, undo, undoDepth } from "prosemirror-history";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { splitElement } from "../../src/screenplay/element-keys.ts";
import { HISTORY_DEPTH, PAUSE_MS } from "../../src/screenplay/undo-grouping.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

const FOUNTAIN = "EXT. CANAL - DAWN\n\nMara kneels.\n";
/** The end of "Mara kneels.", where the tests type. */
const END = "Mara kneels.".length;

/** The writer at the paper: the state, and a clock that keystrokes advance. */
function writer() {
  let state = editorStateFor(parse(FOUNTAIN));
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, 1) + END)));
  let clock = 10_000;
  const apply = (tr: ReturnType<EditorState["tr"]["setTime"]>): void => {
    state = state.apply(tr);
  };
  return {
    state: () => state,
    action: () => manuscriptOf(state.doc).elements[1]!.text,
    /** Type each character as its own keystroke, `gap` milliseconds apart. */
    type(text: string, gap = 100) {
      for (const character of text) {
        clock += gap;
        apply(state.tr.insertText(character).setTime(clock));
      }
    },
    /** Backspace, `times` over. */
    backspace(times: number, gap = 100) {
      for (let n = 0; n < times; n++) {
        clock += gap;
        const { from } = state.selection;
        apply(state.tr.delete(from - 1, from).setTime(clock));
      }
    },
    /** Put the caret `offset` characters into the action line. */
    caretAt(offset: number) {
      clock += 100;
      apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, 1) + offset)).setTime(clock));
    },
    wait(ms: number) {
      clock += ms;
    },
    paste(text: string) {
      clock += 100;
      apply(state.tr.insertText(text).setMeta("uiEvent", "paste").setTime(clock));
    },
    enter() {
      splitElement(state, (tr) => apply(tr.setTime((clock += 100))));
    },
    undo(): boolean {
      return undo(state, (tr) => apply(tr));
    },
    redo(): boolean {
      return redo(state, (tr) => apply(tr));
    },
  };
}

describe("an undo step is a phrase", () => {
  it("takes a burst of typing back in one step", () => {
    const writing = writer();
    writing.type(" She folds a boat from the letter");
    expect(writing.action()).toBe("Mara kneels. She folds a boat from the letter");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
    expect(writing.undo()).toBe(false);
  });

  it("begins a new step after the end of a sentence, and the full stop stays with its sentence", () => {
    const writing = writer();
    writing.type(" She folds a boat. It floats! Does it sink? No");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. She folds a boat. It floats! Does it sink?");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. She folds a boat. It floats!");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. She folds a boat.");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("keeps an ellipsis and a closing quote with the sentence they end", () => {
    const writing = writer();
    writing.type(' "Wait..." Then');
    writing.undo();
    expect(writing.action()).toBe('Mara kneels. "Wait..."');
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("begins a new step after a pause of about a second, and not after a shorter one", () => {
    const writing = writer();
    writing.type(" The water");
    writing.wait(PAUSE_MS - 200);
    writing.type(" is cold");
    writing.wait(PAUSE_MS);
    writing.type(" and slow");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. The water is cold");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("begins a new step where the caret was moved elsewhere", () => {
    const writing = writer();
    writing.type(" Slowly");
    writing.caretAt(0);
    writing.type("At dawn ");
    expect(writing.action()).toBe("At dawn Mara kneels. Slowly");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. Slowly");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("keeps one step when the caret goes away and comes back to where the typing was", () => {
    const writing = writer();
    writing.type(" Slow");
    writing.caretAt(0);
    writing.caretAt(END + " Slow".length);
    writing.type("ly");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("begins a new step when typing turns into deleting, and when deleting turns back into typing", () => {
    const writing = writer();
    writing.type(" The boats");
    writing.backspace(5);
    writing.type("paper");
    expect(writing.action()).toBe("Mara kneels. The paper");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. The ");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels. The boats");
    writing.undo();
    expect(writing.action()).toBe("Mara kneels.");
  });

  it("makes a new element, and a paste, steps of their own", () => {
    const writing = writer();
    writing.type(" Hush");
    writing.enter();
    writing.type("She lets go");
    writing.paste(" of the boat");
    const lines = () => manuscriptOf(writing.state().doc).elements.map((element) => element.text);
    expect(lines()).toEqual(["EXT. CANAL - DAWN", "Mara kneels. Hush", "She lets go of the boat"]);
    writing.undo();
    expect(lines()).toEqual(["EXT. CANAL - DAWN", "Mara kneels. Hush", "She lets go"]);
    // The new line is still there, empty, so the file leaves it out.
    writing.undo();
    expect(lines()).toEqual(["EXT. CANAL - DAWN", "Mara kneels. Hush"]);
    expect(writing.state().doc.childCount).toBe(3);
    writing.undo();
    expect(writing.state().doc.childCount).toBe(2);
    expect(lines()).toEqual(["EXT. CANAL - DAWN", "Mara kneels. Hush"]);
    writing.undo();
    expect(serialise(manuscriptOf(writing.state().doc))).toBe(FOUNTAIN);
  });

  it("redoes the same steps it undid, and returns to the opened bytes", () => {
    const writing = writer();
    writing.type(" She folds a boat. It floats");
    writing.backspace(6);
    const edited = writing.action();
    while (writing.undo());
    expect(serialise(manuscriptOf(writing.state().doc))).toBe(FOUNTAIN);
    while (writing.redo());
    expect(writing.action()).toBe(edited);
  });
});

describe("how far back undo goes", () => {
  it(`keeps ${HISTORY_DEPTH} steps`, () => {
    const writing = writer();
    // Each sentence is a step of its own.
    for (let n = 0; n < HISTORY_DEPTH + 40; n++) writing.type(" Go.");
    expect(undoDepth(writing.state())).toBeGreaterThanOrEqual(HISTORY_DEPTH);
    let undone = 0;
    while (writing.undo()) undone += 1;
    expect(undone).toBeGreaterThanOrEqual(HISTORY_DEPTH);
    // The oldest are gone: the history does not reach back to the opened file.
    expect(writing.action()).not.toBe("Mara kneels.");
    expect(writing.action().startsWith("Mara kneels. Go.")).toBe(true);
  });
});
