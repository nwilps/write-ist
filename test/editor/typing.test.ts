/**
 * Typing, with no window (#41, seam 2).
 *
 * `#37`'s second testing seam: *"start from Fountain, apply what a writer does
 * […] then assert the resulting Fountain **and** the type of each element."*
 * So every test here reads Fountain in and Fountain out, and asserts the
 * census beside the bytes — because ADR-0021 records twice that the bytes
 * cannot see a misread element.
 *
 * Nothing in this file touches a DOM. `prosemirror-state` is pure data, which
 * is what makes the editor reachable without the window.
 */
import { describe, expect, it } from "vitest";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";
import type { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import {
  holdJoinBackwards,
  holdJoinForwards,
  holdSplit,
} from "../../src/screenplay/held-keys.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import type { ElementType } from "../../src/screenplay/document.ts";

/** A writer's file, opened. */
function opened(fountain: string): EditorState {
  return editorStateFor(parse(fountain));
}

/** The manuscript as it would be saved: the model out, through the serialiser. */
function saved(state: EditorState): string {
  return serialise(manuscriptOf(state.doc));
}

/** Every element's type, in order — the half of the result the bytes cannot see. */
function types(state: EditorState): readonly ElementType[] {
  return manuscriptOf(state.doc).elements.map((element) => element.type);
}

/** Type `text` at an offset into an element, the way a keystroke does. */
function type(state: EditorState, element: number, offset: number, text: string): EditorState {
  return state.apply(state.tr.insertText(text, startOfElement(state, element) + offset));
}

/** Delete a span of one element's text, the way a selection and a key do. */
function remove(state: EditorState, element: number, from: number, to: number): EditorState {
  const start = startOfElement(state, element);
  return state.apply(state.tr.delete(start + from, start + to));
}

/** The text each comment covers, which is the thing an offset that drifted breaks. */
function covered(state: EditorState): readonly (readonly [string, string])[] {
  const document = manuscriptOf(state.doc);
  return document.comments.map((comment) => {
    const parts: string[] = [];
    for (let at = comment.start.element; at <= comment.end.element; at++) {
      const text = document.elements[at]!.text;
      parts.push(
        text.slice(
          at === comment.start.element ? comment.start.offset : 0,
          at === comment.end.element ? comment.end.offset : text.length,
        ),
      );
    }
    return [comment.id, parts.join("\n")] as const;
  });
}

const SCENE = [
  "INT. KITCHEN - DAY",
  "",
  "Mary makes toast.",
  "",
  "MARY",
  "Morning.",
  "",
  "> FADE OUT.",
].join("\n");

describe("typing changes the element the caret is in", () => {
  it("inserts into the element's text and leaves every type alone", () => {
    const state = type(opened(SCENE), 1, 5, "slowly ");

    expect(saved(state)).toBe(SCENE.replace("Mary makes", "Mary slowly makes"));
    expect(types(state)).toEqual([
      "scene-heading",
      "action",
      "character",
      "dialogue",
      "transition",
    ]);
  });

  it("deletes from the element's text", () => {
    // "Mary makes toast." — offsets 5 to 11 are "makes ".
    const state = remove(opened(SCENE), 1, 5, 11);

    expect(saved(state)).toBe(SCENE.replace("Mary makes toast.", "Mary toast."));
    expect(types(state)).toHaveLength(5);
  });

  it("types into a dialogue line without disturbing the speech", () => {
    const state = type(opened(SCENE), 3, 7, ", love");

    expect(saved(state)).toBe(SCENE.replace("Morning.", "Morning, love."));
    expect(types(state)[3]).toBe("dialogue");
  });

  it("keeps a scene heading a scene heading while it is edited", () => {
    // Unforced, so its type is read from its text: the serialiser writes no
    // `.` and the model must still call it a heading on the way back in.
    const state = type(opened(SCENE), 0, 18, " - LATER");

    expect(saved(state)).toBe(SCENE.replace("INT. KITCHEN - DAY", "INT. KITCHEN - DAY - LATER"));
    expect(types(state)[0]).toBe("scene-heading");
  });

  it("carries a mark with the text typed inside it", () => {
    const italics = "Mary *makes toast*.";
    const state = type(opened(italics), 0, 11, "burnt ");

    expect(saved(state)).toBe("Mary *makes burnt toast*.");
  });
});

describe("a comment stays on the words it was left on (ADR-0018)", () => {
  const WITH_COMMENT = [
    "INT. KITCHEN - DAY",
    "",
    "Mary [[c:a1 check this]]makes toast[[/c:a1]].",
  ].join("\n");

  it("reads the comment off the file before anything is typed", () => {
    expect(covered(opened(WITH_COMMENT))).toEqual([["a1", "makes toast"]]);
  });

  it("moves with text typed before it", () => {
    const state = type(opened(WITH_COMMENT), 1, 0, "Slowly, ");

    expect(covered(state)).toEqual([["a1", "makes toast"]]);
    expect(saved(state)).toBe(WITH_COMMENT.replace("Mary [[", "Slowly, Mary [["));
  });

  it("is unmoved by text typed after it", () => {
    const state = type(opened(WITH_COMMENT), 1, 17, " Then she eats it.");

    expect(covered(state)).toEqual([["a1", "makes toast"]]);
  });

  it("widens with text typed inside it", () => {
    const state = type(opened(WITH_COMMENT), 1, 11, "burnt ");

    expect(covered(state)).toEqual([["a1", "makes burnt toast"]]);
    expect(saved(state)).toBe(
      "INT. KITCHEN - DAY\n\nMary [[c:a1 check this]]makes burnt toast[[/c:a1]].",
    );
  });

  it("leaves text typed at its opening delimiter outside it", () => {
    const state = type(opened(WITH_COMMENT), 1, 5, "just ");

    expect(covered(state)).toEqual([["a1", "makes toast"]]);
    expect(saved(state)).toBe(
      "INT. KITCHEN - DAY\n\nMary just [[c:a1 check this]]makes toast[[/c:a1]].",
    );
  });

  it("leaves text typed at its closing delimiter outside it", () => {
    const state = type(opened(WITH_COMMENT), 1, 16, " today");

    expect(covered(state)).toEqual([["a1", "makes toast"]]);
    expect(saved(state)).toBe(
      "INT. KITCHEN - DAY\n\nMary [[c:a1 check this]]makes toast[[/c:a1]] today.",
    );
  });

  it("goes with the last of the text it covered", () => {
    const state = remove(opened(WITH_COMMENT), 1, 5, 16);

    expect(covered(state)).toEqual([]);
    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nMary .");
  });

  it("survives an edit in an element above it, which moves its element index", () => {
    const state = type(opened(WITH_COMMENT), 0, 18, " - LATER");

    expect(covered(state)).toEqual([["a1", "makes toast"]]);
  });

  it("keeps both of two comments over the same words apart", () => {
    const nested = "Mary [[c:a1 one]]makes [[c:b2 two]]toast[[/c:b2]] here[[/c:a1]].";
    const state = type(opened(nested), 0, 11, "burnt ");

    expect(covered(state)).toEqual([
      ["a1", "makes burnt toast here"],
      ["b2", "toast"],
    ]);
    expect(saved(state)).toBe(
      "Mary [[c:a1 one]]makes burnt [[c:b2 two]]toast[[/c:b2]] here[[/c:a1]].",
    );
  });
});

describe("the keys #43 owns do nothing rather than something nobody chose", () => {
  /** Put the caret at an offset into an element, the way a click does. */
  function caretAt(state: EditorState, element: number, offset: number): EditorState {
    const at = startOfElement(state, element) + offset;
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
  }

  it("holds Enter, which would make an element whose type nothing has decided", () => {
    expect(holdSplit(caretAt(opened(SCENE), 1, 4))).toBe(true);
  });

  it("holds Backspace at the start of an element, which would join it onto the one above", () => {
    expect(holdJoinBackwards(caretAt(opened(SCENE), 2, 0))).toBe(true);
  });

  it("lets Backspace through anywhere else, so deleting a character still deletes it", () => {
    expect(holdJoinBackwards(caretAt(opened(SCENE), 2, 1))).toBe(false);
  });

  it("holds Delete at the end of an element, and lets it through anywhere else", () => {
    const state = opened(SCENE);
    expect(holdJoinForwards(caretAt(state, 1, "Mary makes toast.".length))).toBe(true);
    expect(holdJoinForwards(caretAt(state, 1, 4))).toBe(false);
  });

  it("does not hold a selection that covers whole elements: they go, and the rest keep their types", () => {
    const state = opened(SCENE);
    const from = startOfElement(state, 2);
    // From the start of the cue through the end of the dialogue below it.
    const to = startOfElement(state, 3) + "Morning.".length;
    const after = state.apply(state.tr.delete(from, to));

    // The two join, as #43 will have Backspace do, and the survivor keeps the
    // upper one's type with nothing left in it. On screen that is the blank
    // line the caret is on; in the file it is nothing at all.
    expect(saved(after)).toBe("INT. KITCHEN - DAY\n\nMary makes toast.\n\n> FADE OUT.");
    expect(types(after)).toEqual(["scene-heading", "action", "transition"]);
  });
});

describe("a blank line the writer made is a blank line, not an element (ADR-0019)", () => {
  it("writes nothing for a line whose every character was deleted", () => {
    const state = remove(opened(SCENE), 1, 0, "Mary makes toast.".length);

    expect(saved(state)).toBe("INT. KITCHEN - DAY\n\nMARY\nMorning.\n\n> FADE OUT.");
    expect(types(state)).toEqual(["scene-heading", "character", "dialogue", "transition"]);
  });

  it("saves a manuscript that reads back as itself (ADR-0020 point 2)", () => {
    const state = remove(opened(SCENE), 1, 0, "Mary makes toast.".length);

    // The promise the whole model is built on: a file Write-ist wrote, opened
    // and saved again without typing, is identical. An empty element written
    // as a blank line is the way that promise breaks — the file would come
    // back one line shorter than it went out.
    const once = saved(state);
    expect(serialise(parse(once))).toBe(once);
  });

  it("moves a comment off a line the writer emptied, onto the next line that has text", () => {
    const across = ["Mary [[c:a1 both lines]]makes toast.", "She eats it[[/c:a1]]."].join("\n");
    const state = remove(opened(across), 0, 0, "Mary makes toast.".length);

    expect(covered(state)).toEqual([["a1", "She eats it"]]);
    expect(saved(state)).toBe("[[c:a1 both lines]]She eats it[[/c:a1]].");
  });

  it("holds the measurement the rule rests on: no manuscript has an element with empty text", () => {
    for (const name of [
      "Brick-&-Steel.fountain",
      "Big-Fish.fountain",
      "Big-Fish-augmented.fountain",
    ]) {
      const document = importScreenplay(readFixtureBytes(name)).document;
      expect(
        document.elements.filter((element) => element.text === ""),
        `${name} holds an element with no text, so leaving blank lines out of the file would drop it`,
      ).toEqual([]);
    }
  });
});

describeCorpus("a blank line the writer made", () => {
  it("is not something the acceptance corpus already holds", () => {
    const document = importScreenplay(readCorpusBytes()).document;
    expect(document.elements.filter((element) => element.text === "")).toEqual([]);
  });
});
