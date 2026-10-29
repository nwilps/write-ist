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
import type { Command, EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import {
  cycleType,
  joinBackwards,
  joinForwards,
  splitElement,
} from "../../src/screenplay/element-keys.ts";
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

/** Put the caret at an offset into an element, the way a click does. */
function caretAt(state: EditorState, element: number, offset: number): EditorState {
  const at = startOfElement(state, element) + offset;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
}

/** Run a key's command; a key that declines leaves the state as it was. */
function press(state: EditorState, command: Command): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

/** The text of every element, in order. */
function texts(state: EditorState): readonly string[] {
  return manuscriptOf(state.doc).elements.map((element) => element.text);
}

/** Press Enter at the end of the element, then type `text` into what it started. */
function enterThenType(state: EditorState, element: number, text: string): EditorState {
  const length = state.doc.nodeAt(startOfElement(state, element) - 1)!.content.size;
  const pressed = press(caretAt(state, element, length), splitElement);
  const at = startOfElement(pressed, element + 1);
  return pressed.apply(pressed.tr.insertText(text, at));
}

/**
 * A writer at the end of the manuscript: each step is a key (`"Enter"`,
 * `"Tab"`) or text to type, with the caret at the end of the last line.
 */
function writes(state: EditorState, steps: readonly string[]): EditorState {
  let now = state;
  for (const step of steps) {
    const end = now.doc.content.size - 1;
    now = now.apply(now.tr.setSelection(TextSelection.create(now.doc, end)));
    if (step === "Enter") now = press(now, splitElement);
    else if (step === "Tab") now = press(now, cycleType);
    else now = now.apply(now.tr.insertText(step));
  }
  return now;
}

describe("Enter at the end of an element starts the one that normally comes next (#43)", () => {
  const cases: readonly (readonly [string, string, ElementType, ElementType])[] = [
    ["a scene heading", "INT. KITCHEN - DAY", "scene-heading", "action"],
    ["an action", "Mary makes toast.", "action", "action"],
    ["a character", "@MARY", "character", "dialogue"],
    ["a dialogue", "@MARY\nMorning.", "dialogue", "action"],
    ["a parenthetical", "@MARY\n(quietly)", "parenthetical", "dialogue"],
    ["a transition", "> CUT TO:", "transition", "scene-heading"],
    ["a centered line", "> THE END <", "centered", "scene-heading"],
    ["anything else (a lyric)", "~La la la", "lyrics", "action"],
  ];
  for (const [name, fountain, type, next] of cases) {
    it(`after ${name} comes ${next}`, () => {
      const state = opened(fountain);
      const last = types(state).length - 1;
      expect(types(state)[last]).toBe(type);
      const after = enterThenType(state, last, "x");
      expect(types(after)[last + 1]).toBe(next);
      expect(types(after)[last]).toBe(type);
      expect(texts(after)[last + 1]).toBe("x");
    });
  }

  it("goes from a character straight to dialogue, not to a parenthetical", () => {
    const after = enterThenType(opened("INT. ROOM - DAY\n\n@MARY"), 1, "Hello.");
    expect(types(after)).toEqual(["scene-heading", "character", "dialogue"]);
    expect(saved(after)).toBe("INT. ROOM - DAY\n\n@MARY\nHello.");
  });

  it("goes from a parenthetical back to dialogue", () => {
    const state = opened("@MARY\n(quietly)");
    const after = enterThenType(state, 1, "More.");
    expect(types(after)).toEqual(["character", "parenthetical", "dialogue"]);
    expect(texts(after)).toEqual(["MARY", "(quietly)", "More."]);
  });

  it("starts an element whose attributes belong to the new type, not the old", () => {
    const after = enterThenType(opened("INT. A - DAY #4#"), 0, "He waits.");
    expect(types(after)).toEqual(["scene-heading", "action"]);
    expect(saved(after)).toBe("INT. A - DAY #4#\n\nHe waits.");
  });

  it("replaces a selection first, as typing would", () => {
    const state = opened("Mary makes toast.");
    const from = startOfElement(state, 0) + 4;
    const selected = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, from, from + 6)),
    );
    expect(texts(press(selected, splitElement))).toEqual(["Mary", " toast."]);
  });
});

describe("Enter in the middle of an element splits it (#43)", () => {
  it("keeps the type on both halves", () => {
    const after = press(caretAt(opened("INT. KITCHEN - DAY"), 0, 5), splitElement);
    expect(types(after)).toEqual(["scene-heading", "scene-heading"]);
    expect(texts(after)).toEqual(["INT. ", "KITCHEN - DAY"]);
  });

  it("splits a line of dialogue into two dialogue lines", () => {
    const after = press(caretAt(opened(SCENE), 3, 4), splitElement);
    expect(types(after)).toEqual([
      "scene-heading",
      "action",
      "character",
      "dialogue",
      "dialogue",
      "transition",
    ]);
    expect(texts(after).slice(3, 5)).toEqual(["Morn", "ing."]);
  });

  it("at the very start of an element leaves an empty line above, which is not written", () => {
    const after = press(caretAt(opened("Mary makes toast."), 0, 0), splitElement);
    expect(types(after)).toEqual(["action"]);
    expect(saved(after)).toBe("Mary makes toast.");
  });
});

describe("Tab changes the type of the line the caret is on (#43)", () => {
  it("walks the whole cycle and comes back to a scene heading", () => {
    let state = caretAt(opened("INT. KITCHEN - DAY"), 0, 3);
    const seen: ElementType[] = [];
    for (let step = 0; step < 6; step++) {
      state = press(state, cycleType);
      seen.push(types(state)[0]!);
    }
    expect(seen).toEqual([
      "action",
      "character",
      "dialogue",
      "parenthetical",
      "transition",
      "scene-heading",
    ]);
  });

  it("reaches a parenthetical from dialogue", () => {
    const after = press(caretAt(opened("@MARY\nHello."), 1, 2), cycleType);
    expect(types(after)).toEqual(["character", "parenthetical"]);
  });

  it("leaves the text and the caret where they were", () => {
    const state = caretAt(opened("Mary makes toast."), 0, 5);
    const after = press(state, cycleType);
    expect(texts(after)).toEqual(["Mary makes toast."]);
    expect(after.selection.from).toBe(state.selection.from);
  });

  it("always claims the key, even for a type outside the cycle", () => {
    const state = caretAt(opened("~La la la"), 0, 2);
    expect(cycleType(state, () => {})).toBe(true);
    expect(types(press(state, cycleType))).toEqual(["lyrics"]);
  });
});

describe("Backspace at the start of an element joins it onto the one above (#43)", () => {
  it("keeps the upper element's type", () => {
    const after = press(caretAt(opened(SCENE), 3, 0), joinBackwards);
    expect(types(after)).toEqual(["scene-heading", "action", "character", "transition"]);
    expect(texts(after)[2]).toBe("MARYMorning.");
  });

  it("puts the caret at the seam", () => {
    const after = press(caretAt(opened(SCENE), 3, 0), joinBackwards);
    expect(after.selection.from).toBe(startOfElement(after, 2) + "MARY".length);
  });

  it("undoes a split exactly", () => {
    const before = opened(SCENE);
    const split = press(caretAt(before, 1, 4), splitElement);
    const joined = press(caretAt(split, 2, 0), joinBackwards);
    expect(saved(joined)).toBe(saved(before));
    expect(types(joined)).toEqual(types(before));
  });

  it("is left to the editor anywhere else, and claimed at the top of the manuscript", () => {
    expect(joinBackwards(caretAt(opened(SCENE), 2, 1))).toBe(false);
    expect(joinBackwards(caretAt(opened(SCENE), 0, 0))).toBe(true);
  });

  it("moves a comment with the words it covers", () => {
    const state = opened("Mary [[c:a1 hi]]makes[[/c:a1]]\n\nToast.");
    const after = press(caretAt(state, 1, 0), joinBackwards);
    expect(covered(after)).toEqual([["a1", "makes"]]);
  });
});

describe("Delete at the end of an element pulls the one below onto it (#43)", () => {
  it("keeps the upper element's type", () => {
    const after = press(caretAt(opened(SCENE), 2, 4), joinForwards);
    expect(types(after)).toEqual(["scene-heading", "action", "character", "transition"]);
    expect(texts(after)[2]).toBe("MARYMorning.");
  });

  it("is left to the editor anywhere else, and claimed at the end of the manuscript", () => {
    const state = opened(SCENE);
    expect(joinForwards(caretAt(state, 1, 4))).toBe(false);
    const last = types(state).length - 1;
    expect(joinForwards(caretAt(state, last, texts(state)[last]!.length))).toBe(true);
  });
});

describe("a selection across several elements is not held", () => {
  it("removes the elements it covers, and the rest keep their types", () => {
    const state = opened(SCENE);
    const from = startOfElement(state, 2);
    // From the start of the cue through the end of the dialogue below it.
    const to = startOfElement(state, 3) + "Morning.".length;
    const after = state.apply(state.tr.delete(from, to));

    // The two join and the survivor keeps the upper one's type with nothing
    // left in it. On screen that is the blank line the caret is on; in the
    // file it is nothing at all.
    expect(saved(after)).toBe("INT. KITCHEN - DAY\n\nMary makes toast.\n\n> FADE OUT.");
    expect(types(after)).toEqual(["scene-heading", "action", "transition"]);
  });
});

describe("a scene built entirely from keystrokes saves as correctly spaced Fountain (ADR-0019)", () => {
  it("spaces headings, action, a cue with its lines, and a transition", () => {
    const state = writes(opened("INT. KITCHEN - DAY"), [
      "Enter", // → action
      "Mary makes toast.",
      "Enter", // → action
      "Tab", // → character
      "MARY",
      "Enter", // → dialogue
      "Tab", // → parenthetical
      "(beat)",
      "Enter", // → dialogue
      "Morning.",
      "Enter", // → action
      "Tab",
      "Tab",
      "Tab",
      "Tab", // → character, dialogue, parenthetical, transition
      "CUT TO:",
      "Enter", // → scene heading
      "INT. HALL - DAY",
    ]);
    expect(types(state)).toEqual([
      "scene-heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
      "scene-heading",
    ]);
    expect(saved(state)).toBe(
      [
        "INT. KITCHEN - DAY",
        "",
        "Mary makes toast.",
        "",
        "MARY",
        "(beat)",
        "Morning.",
        "",
        "CUT TO:",
        "",
        "INT. HALL - DAY",
      ].join("\n"),
    );
  });

  it("reads back as the same elements it was written as", () => {
    const state = writes(opened("INT. KITCHEN - DAY"), [
      "Enter",
      "Mary waits.",
      "Enter",
      "Tab",
      "MARY",
      "Enter",
      "Hi.",
    ]);
    expect(parse(saved(state)).elements.map((e) => e.type)).toEqual(types(state));
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
