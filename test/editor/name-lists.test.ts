/**
 * The name lists as the editor keeps them (slice 2, step 8).
 *
 * The lists are derived from the model and updated from the elements an edit
 * changed. The property that matters is that updating is *the same as*
 * counting afresh, after any sequence of edits; the cost that matters is that
 * one keystroke hands the lists a handful of elements and not the manuscript.
 */
import { describe, expect, it } from "vitest";
import { undo } from "prosemirror-history";
import { TextSelection, type EditorState } from "prosemirror-state";
import { editorStateFor } from "../../src/screenplay/editing.ts";
import { cycleType, setElementType, splitElement } from "../../src/screenplay/element-keys.ts";
import { importScreenplay } from "../../src/screenplay/import.ts";
import { NameLists, nameOf, type NameKind } from "../../src/screenplay/names.ts";
import { nameLinesOf, namesOf, syncNames } from "../../src/screenplay/names-sync.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { startOfElement } from "../support/editor-positions.ts";
import { readFixtureBytes } from "../support/files.ts";

const KINDS: readonly NameKind[] = ["character", "location"];

function opened(fountain: string): EditorState {
  return editorStateFor(parse(fountain));
}

function press(state: EditorState, command: typeof splitElement): EditorState {
  let next = state;
  command(state, (tr) => {
    next = state.apply(tr);
  });
  return next;
}

/** The lists counted afresh from the state's document. */
const setCue = setElementType("character");

const fresh = (state: EditorState): NameLists => namesOf(state.doc);

function same(a: NameLists, b: NameLists): void {
  for (const kind of KINDS) expect(a.entries(kind)).toEqual(b.entries(kind));
}

const SCRIPT = [
  "INT. KITCHEN - DAY",
  "",
  "Morning.",
  "",
  "@EDWARD",
  "Hello.",
  "",
  "@SANDRA (V.O.)",
  "Hi.",
  "",
  "EXT. YARD - NIGHT",
  "",
  "@EDWARD",
  "Again.",
].join("\n");

describe("a document's lists", () => {
  it("count the cues and headings in it", () => {
    const lists = fresh(opened(SCRIPT));
    expect(lists.entries("character")).toEqual([
      { name: "EDWARD", uses: 2, confirmed: false, explicit: false },
      { name: "SANDRA", uses: 1, confirmed: false, explicit: false },
    ]);
    expect(lists.entries("location").map((entry) => [entry.name, entry.uses])).toEqual([
      ["KITCHEN", 1],
      ["YARD", 1],
    ]);
  });

  it("skip the title page and cut material", () => {
    const lists = fresh(
      opened(["Title: X", "", "INT. A - DAY", "", "/*", "@GHOST", "Boo.", "*/", "", "@REAL", "Hi."].join("\n")),
    );
    expect(lists.entries("character").map((entry) => entry.name)).toEqual(["REAL"]);
    expect(lists.entries("location").map((entry) => entry.name)).toEqual(["A"]);
  });
});

/*
 * SCRIPT's elements, blank lines not counted:
 * 0 heading KITCHEN, 1 action, 2 cue EDWARD, 3 dialogue, 4 cue SANDRA (V.O.),
 * 5 dialogue, 6 heading YARD, 7 cue EDWARD, 8 dialogue.
 */
const textOf = (state: EditorState, element: number): string =>
  state.doc.nodeAt(startOfElement(state, element) - 1)!.textContent;

/** Dispatch a transaction and bring the lists along, as the editor does. */
function edit(
  state: EditorState,
  lists: NameLists,
  make: (state: EditorState) => EditorState,
): EditorState {
  const next = make(state);
  syncNames(lists, state.doc, next.doc);
  same(lists, fresh(next));
  return next;
}

const typeAtEnd = (element: number, text: string) => (state: EditorState): EditorState =>
  state.apply(state.tr.insertText(text, startOfElement(state, element) + textOf(state, element).length));

describe("typing", () => {
  it("builds a name up and takes it down a letter at a time, with the lists right at every step", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    state = edit(state, lists, typeAtEnd(7, "S"));
    expect(lists.uses("character", "EDWARDS")).toBe(1);
    expect(lists.uses("character", "EDWARD")).toBe(1);

    state = edit(state, lists, (s) => {
      const end = startOfElement(s, 7) + textOf(s, 7).length;
      return s.apply(s.tr.delete(end - 1, end));
    });
    expect(lists.uses("character", "EDWARD")).toBe(2);
    expect(lists.uses("character", "EDWARDS")).toBe(0);
  });

  it("confirms a name on its third use, live, and not before", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    expect(lists.isConfirmed("character", "EDWARD")).toBe(false);

    // The action line becomes a third EDWARD cue.
    state = edit(state, lists, (s) => {
      const start = startOfElement(s, 1);
      return s.apply(s.tr.replaceWith(start, start + textOf(s, 1).length, s.schema.text("EDWARD")));
    });
    state = edit(state, lists, (s) => {
      const at = startOfElement(s, 1) + 6;
      return press(s.apply(s.tr.setSelection(TextSelection.create(s.doc, at))), setCue);
    });
    expect(lists.uses("character", "EDWARD")).toBe(3);
    expect(lists.isConfirmed("character", "EDWARD")).toBe(true);

    // And it falls back when a cue goes.
    state = edit(state, lists, (s) => {
      const start = startOfElement(s, 7);
      return s.apply(s.tr.delete(start, start + textOf(s, 7).length));
    });
    expect(lists.uses("character", "EDWARD")).toBe(2);
    expect(lists.isConfirmed("character", "EDWARD")).toBe(false);
  });

  it("follows an element cycled through every type, and back", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, 2))));
    for (let i = 0; i < 8; i++) state = edit(state, lists, (s) => press(s, cycleType));
  });

  it("follows a split that makes a new element", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, 2) + 3)));
    state = edit(state, lists, (s) => press(s, splitElement));
    expect(lists.uses("character", "EDWARD")).toBe(1);
    expect(textOf(state, 2)).toBe("EDW");
  });

  it("follows a boneyard that cuts a cue from the manuscript", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    expect(lists.uses("character", "SANDRA")).toBe(1);
    state = edit(state, lists, (s) => {
      const at = startOfElement(s, 4) - 1;
      return s.apply(s.tr.setNodeMarkup(at, undefined, { ...s.doc.nodeAt(at)!.attrs, omitted: true }));
    });
    expect(lists.uses("character", "SANDRA")).toBe(0);
    state = edit(state, lists, (s) => {
      const at = startOfElement(s, 4) - 1;
      return s.apply(s.tr.setNodeMarkup(at, undefined, { ...s.doc.nodeAt(at)!.attrs, omitted: false }));
    });
    expect(lists.uses("character", "SANDRA")).toBe(1);
  });

  it("follows undo", () => {
    let state = opened(SCRIPT);
    const lists = fresh(state);
    state = edit(state, lists, typeAtEnd(7, "S"));
    let undone = state;
    undo(state, (tr) => {
      undone = state.apply(tr);
    });
    edit(state, lists, () => undone);
    expect(lists.uses("character", "EDWARD")).toBe(2);
  });
});

describe("incrementally equals afresh", () => {
  /** A small deterministic generator, so a failure can be replayed. */
  function random(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 1664525 + 1013904223) % 4294967296;
      return value / 4294967296;
    };
  }

  it.each([1, 2, 3, 4, 5])("after any run of edits (seed %i)", (seed) => {
    const next = random(seed);
    const words = ["EDWARD", "SANDRA", "INT. KITCHEN - DAY", "EXT. YARD - NIGHT", "x", "\n", " (V.O.)", "a"];
    let state = opened(SCRIPT);
    const lists = fresh(state);
    for (let i = 0; i < 300; i++) {
      const before = state;
      const size = state.doc.content.size;
      const a = 1 + Math.floor(next() * (size - 1));
      const roll = next();
      try {
        if (roll < 0.5) {
          state = state.apply(state.tr.insertText(words[Math.floor(next() * words.length)]!, a));
        } else if (roll < 0.8) {
          state = state.apply(state.tr.delete(a, Math.min(size - 1, a + 1 + Math.floor(next() * 6))));
        } else {
          state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(a))));
          state = press(state, next() < 0.5 ? splitElement : cycleType);
        }
      } catch {
        // An edit ProseMirror refuses at that spot is simply not made.
        state = before;
      }
      syncNames(lists, before.doc, state.doc);
      same(lists, fresh(state));
    }
  });
});

describe("the cost of a keystroke", () => {
  it("hands the lists the elements it changed, not the manuscript", () => {
    const document = importScreenplay(readFixtureBytes("Big-Fish.fountain")).document;
    let state = editorStateFor(document);
    const lists = namesOf(state.doc);
    const handed: number[] = [];
    const apply = lists.apply.bind(lists);
    lists.apply = (removed, inserted) => {
      handed.push(removed.length + inserted.length);
      return apply(removed, inserted);
    };

    const cueIndex = document.elements.findIndex((element) => element.type === "character");
    const headingIndex = document.elements.findIndex((element) => element.type === "scene-heading");
    for (const element of [cueIndex, headingIndex, Math.floor(document.elements.length / 2), document.elements.length - 1]) {
      const before = state.doc;
      state = state.apply(state.tr.insertText("a", startOfElement(state, element)));
      syncNames(lists, before, state.doc);
    }
    // One element out, one in, each time.
    expect(handed).toEqual([2, 2, 2, 2]);
    expect(nameLinesOf(state.doc).length).toBe(document.elements.length);
  });

  it("is a small part of a frame on Big Fish", () => {
    const document = importScreenplay(readFixtureBytes("Big-Fish.fountain")).document;
    let state = editorStateFor(document);
    const lists = namesOf(state.doc);
    const cue = document.elements.findIndex((element, i) => element.type === "character" && i > 1500);
    const at = startOfElement(state, cue);

    const KEYSTROKES = 500;
    let spent = 0;
    // The whole loop is timed, the two clock reads inside it: the measurement
    // is part of what is reported (docs/STANDARDS.md, measure the measurer).
    const from = performance.now();
    for (let i = 0; i < KEYSTROKES; i++) {
      const before = state.doc;
      state = state.apply(state.tr.insertText("a", at));
      const started = performance.now();
      syncNames(lists, before, state.doc);
      spent += performance.now() - started;
    }
    const whole = (performance.now() - from) / KEYSTROKES;
    const counting = performance.now();
    namesOf(state.doc);
    const afresh = performance.now() - counting;
    console.log(
      `name lists on ${document.elements.length} elements: ${(spent / KEYSTROKES).toFixed(4)} ms a keystroke in sync ` +
        `(loop incl. the edit: ${whole.toFixed(4)} ms); counting afresh would be ${afresh.toFixed(2)} ms`,
    );
    expect(spent / KEYSTROKES).toBeLessThan(16);
    // The lists really followed the typing: the cue now starts with 500 extra letters.
    const typed = nameLinesOf(state.doc)[cue]!.text;
    expect(typed.toUpperCase().startsWith("A".repeat(KEYSTROKES))).toBe(true);
    const read = nameOf({ type: "character", text: typed });
    expect(lists.uses("character", read!.name)).toBe(1);
  });
});
