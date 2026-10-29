/**
 * Cut, copy and paste, with no window (#47, seam 2).
 *
 * `copyOf` and `pasteTransaction` are the functions the view's clipboard
 * handlers call; here they are called directly with the strings a clipboard
 * would hold. Fountain in, copy and paste, Fountain out — with the element
 * census beside the bytes.
 */
import { describe, expect, it } from "vitest";
import type { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { copyOf, pasteTransaction, type Incoming } from "../../src/screenplay/clipboard.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
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
function select(
  state: EditorState,
  from: readonly [number, number],
  to: readonly [number, number] = from,
): EditorState {
  const a = startOfElement(state, from[0]) + from[1];
  const b = startOfElement(state, to[0]) + to[1];
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, a, b)));
}
function copy(state: EditorState) {
  const copied = copyOf(state);
  if (copied === null) throw new Error("nothing was copied");
  return copied;
}
function paste(state: EditorState, incoming: Incoming, mint?: () => string): EditorState {
  const tr = pasteTransaction(state, incoming, mint);
  if (tr === null) throw new Error("nothing was pasted");
  return state.apply(tr);
}
function cut(state: EditorState): EditorState {
  return state.apply(state.tr.deleteSelection());
}

const SCENE =
  ".**INT. OFFICE - DAY**\n\nShe *waits* by the door.\n\nBOB\nIs it **ready**?\n\n";
const SCRIPT = `${SCENE}EXT. STREET - NIGHT\n\nRain falls.\n`;

describe("inside Write-ist", () => {
  it("copies a scene and pastes it elsewhere, element for element, mark for mark", () => {
    // Elements 0-3 are the scene; 5 is "Rain falls." — paste after it.
    let state = select(opened(SCRIPT), [0, 0], [3, "Is it ready?".length]);
    const clip = copy(state);
    expect(clip.text).toBe(SCENE.trimEnd());

    state = select(state, [5, "Rain falls.".length]);
    state = paste(state, clip);

    expect(saved(state)).toBe(`${SCRIPT.trimEnd()}\n\n${SCENE.trimEnd()}\n`);
    const elements = manuscriptOf(state.doc).elements;
    expect(types(state)).toEqual([
      "scene-heading", "action", "character", "dialogue",
      "scene-heading", "action",
      "scene-heading", "action", "character", "dialogue",
    ]);
    // The copy is the original, marks and forcing markers included.
    expect(elements.slice(6)).toEqual(elements.slice(0, 4));
    expect(elements[7]!.marks).toEqual([{ mark: "italic", start: 4, end: 9 }]);
    expect(elements[9]!.marks).toEqual([{ mark: "bold", start: 6, end: 11 }]);
  });

  it("keeps the type of an element pasted onto a blank line", () => {
    let state = select(opened("BOB\nHello.\n\nShe waits.\n"), [0, 0], [1, 6]);
    const clip = copy(state);
    state = select(state, [2, 0]);
    // The caret is at the start of "She waits.": the speech goes in before it.
    state = paste(state, clip);
    expect(types(state)).toEqual(["character", "dialogue", "character", "dialogue", "action"]);
  });

  it("pastes part of a line into a line, taking the marks with it", () => {
    let state = select(opened("She *waits* here.\n\nHe goes.\n"), [0, 4], [0, 9]);
    const clip = copy(state);
    expect(clip.text).toBe("waits");
    state = select(state, [1, 2]);
    state = paste(state, clip);
    expect(saved(state)).toBe("She *waits* here.\n\nHe*waits* goes.\n");
    expect(types(state)).toEqual(["action", "action"]);
  });

  it("cuts and pastes: the scene moves, and nothing is left behind", () => {
    let state = select(opened(SCRIPT), [0, 0], [3, "Is it ready?".length]);
    const clip = copy(state);
    state = cut(state);
    // The cut leaves the first element standing, empty: a blank line.
    expect(types(state)).toEqual(["scene-heading", "action"]);
    state = select(state, [2, "Rain falls.".length]);
    state = paste(state, clip);
    expect(types(state)).toEqual([
      "scene-heading", "action", "scene-heading", "action", "character", "dialogue",
    ]);
    expect(saved(state)).toBe(`EXT. STREET - NIGHT\n\nRain falls.\n\n${SCENE.trimEnd()}\n`);
  });
});

describe("from another application", () => {
  it("reads plain Fountain into the right element types", () => {
    let state = select(opened("Before.\n"), [0, "Before.".length]);
    state = paste(state, { text: "INT. OFFICE - DAY\n\nShe enters.\n" });
    expect(types(state)).toEqual(["action", "scene-heading", "action"]);
    expect(saved(state)).toBe("Before.\n\nINT. OFFICE - DAY\n\nShe enters.\n");
  });

  it("reads a first line like `Note: hi` as text, not a title page", () => {
    const state = paste(select(opened("Before.\n"), [0, 7]), { text: "Note: hi\n\nThere." });
    expect(saved(state)).toBe("Before.\n\nNote: hi\n\nThere.\n");
  });

  it("inserts one line as the words it is", () => {
    const state = paste(select(opened("Mary toast.\n"), [0, 5]), { text: "INT. makes " });
    expect(saved(state)).toBe("Mary INT. makes toast.\n");
    expect(types(state)).toEqual(["action"]);
  });

  it("brings no formatting from rich text", () => {
    const html =
      "<meta charset='utf-8'><p><b>Bold</b> and <i>italic</i> and <u>under</u></p>" +
      "<p style='font-family:Calibri'>Second line</p>";
    let state = select(opened("Start.\n"), [0, 6]);
    state = paste(state, { text: "Bold and italic and under\nSecond line", html });
    const elements = manuscriptOf(state.doc).elements;
    expect(elements.every((element) => element.marks === undefined)).toBe(true);
    expect(saved(state)).not.toMatch(/[*_<]/);

    const inline = paste(select(opened("Start.\n"), [0, 6]), {
      text: "Bold words",
      html,
    });
    expect(manuscriptOf(inline.doc).elements[0]!.marks).toBeUndefined();
    expect(saved(inline)).toBe("Start.Bold words\n");
  });

  it("does not take html for Write-ist's own", () => {
    const html = '<div data-write-ist="{not json"></div><b>x</b>';
    const state = paste(select(opened("A.\n"), [0, 2]), { text: "y", html });
    expect(saved(state)).toBe("A.y\n");
  });
});

describe("comments", () => {
  const COMMENTED = "She [[c:k1 too slow]]waits[[/c:k1]] here.\n\nHe goes.\n";

  it("pastes a copied span with its comment, under a new id where the id is taken", () => {
    let state = select(opened(COMMENTED), [0, 4], [0, 9]);
    const clip = copy(state);
    state = select(state, [1, 2]);
    state = paste(state, clip, () => "k2");

    const comments = manuscriptOf(state.doc).comments;
    expect(comments.map((c) => c.id)).toEqual(["k1", "k2"]);
    expect(comments[0]).toMatchObject({ remark: "too slow", start: { element: 0, offset: 4 }, end: { element: 0, offset: 9 } });
    expect(comments[1]).toMatchObject({ remark: "too slow", start: { element: 1, offset: 2 }, end: { element: 1, offset: 7 } });
    expect(saved(state)).toBe(
      "She [[c:k1 too slow]]waits[[/c:k1]] here.\n\nHe[[c:k2 too slow]]waits[[/c:k2]] goes.\n",
    );
  });

  it("keeps the id when the original is gone: a cut moves its comment", () => {
    let state = select(opened(COMMENTED), [0, 4], [0, 9]);
    const clip = copy(state);
    state = cut(state);
    expect(manuscriptOf(state.doc).comments).toEqual([]);
    state = select(state, [1, 2]);
    state = paste(state, clip, () => {
      throw new Error("no id should be minted");
    });
    expect(manuscriptOf(state.doc).comments.map((c) => c.id)).toEqual(["k1"]);
  });

  it("copies the comment inside whole elements, and Fountain text carries it too", () => {
    let state = select(opened(COMMENTED), [0, 0], [0, "She waits here.".length]);
    const clip = copy(state);
    expect(clip.text).toBe("She [[c:k1 too slow]]waits[[/c:k1]] here.");
    state = select(state, [1, 5]);
    state = paste(state, clip, () => "k9");
    expect(manuscriptOf(state.doc).comments.map((c) => c.id)).toEqual(["k1", "k9"]);
    // Pasting the same text from outside reads the same comment.
    const outside = paste(select(opened(COMMENTED), [1, 5]), { text: `${clip.text}\n\nMore.` }, () => "z7");
    expect(manuscriptOf(outside.doc).comments.map((c) => c.id)).toEqual(["k1", "z7"]);
  });
});
