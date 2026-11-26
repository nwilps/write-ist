/**
 * Comments made, written in and resolved in the editor (ADR-0018, amended
 * 2026-11-25): what the file says afterwards, what Undo brings back, and what
 * the counts, the pages and the exports never see.
 *
 * Every check reads the bytes the serialiser writes *and* what they mean — the
 * element census and which words each comment covers — because two defects
 * here round-tripped perfectly while being wrong.
 */
import { EditorState, TextSelection, type Transaction } from "prosemirror-state";
import { redo, undo, undoDepth } from "prosemirror-history";
import { describe, expect, it } from "vitest";
import { PROSE_COMMENTS, SCREENPLAY_COMMENTS } from "../../src/comments.ts";
import { wordCount } from "../../src/project/ledger.ts";
import {
  activateComment,
  activeComment,
  commentRange,
  DRAFT_ID,
  finishDraft,
  nextCommentId,
  resolveComment,
  setRemark,
  shownComments,
  startComment,
} from "../../src/screenplay/comment-editing.ts";
import type { ScreenplayDocument } from "../../src/screenplay/document.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { fountainCopyOf } from "../../src/screenplay/fountain-copy.ts";
import { paginate } from "../../src/screenplay/paginate.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { pdfPagesOf } from "../../src/screenplay/pdf-pages.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

/** An invented scene: the published fixtures carry no comments of ours. */
const SCRIPT = `INT. KITCHEN - NIGHT

Rain against the window. Maya sits at the table.

MAYA
That's not what she'd say.

Maya pushes the door open and steps into the light.
`;

const ACTION = 1;
const LAST = 4;

function opened(text = SCRIPT): EditorState {
  return editorStateFor(parse(text));
}

/** Apply a transaction, failing loudly where a command declined. */
function run(state: EditorState, tr: Transaction | null): EditorState {
  if (tr === null) throw new Error("the command did nothing");
  return state.apply(tr);
}

function caretAt(state: EditorState, element: number, offset: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, element) + offset)));
}

function select(state: EditorState, element: number, from: number, to: number): EditorState {
  const base = startOfElement(state, element);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, base + from, base + to)));
}

function fileOf(state: EditorState): string {
  return serialise(manuscriptOf(state.doc));
}

/** The words a comment covers, read off the model. */
function covered(document: ScreenplayDocument, id: string): string {
  const comment = document.comments.find((c) => c.id === id)!;
  expect(comment.start.element).toBe(comment.end.element);
  return document.elements[comment.start.element]!.text.slice(comment.start.offset, comment.end.offset);
}

/** Each element's type and text: the census the bytes must agree with. */
function census(document: ScreenplayDocument): string[] {
  return document.elements.map((element) => `${element.type}: ${element.text}`);
}

const undoing = (state: EditorState): EditorState => {
  let next = state;
  expect(undo(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
};
const redoing = (state: EditorState): EditorState => {
  let next = state;
  expect(redo(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
};

/** A comment made the way the card makes one: open the draft, type, leave. */
function commented(state: EditorState, remark: string): EditorState {
  const drafted = run(state, startComment(state));
  return run(drafted, finishDraft(drafted, remark));
}

describe("what a new comment covers", () => {
  it("covers the caret's line when nothing is selected", () => {
    const state = caretAt(opened(), LAST, 5);
    const range = commentRange(state)!;
    expect(state.doc.textBetween(range.start, range.end)).toBe("Maya pushes the door open and steps into the light.");
  });

  it("covers exactly the selection when there is one", () => {
    const state = select(opened(), LAST, 0, 25);
    const range = commentRange(state)!;
    expect(state.doc.textBetween(range.start, range.end)).toBe("Maya pushes the door open");
  });

  it("covers only the line the caret is on when an element holds two", () => {
    const state = caretAt(opened("Rain on the glass.\nA dog barks.\n"), 0, 22);
    const range = commentRange(state)!;
    expect(state.doc.textBetween(range.start, range.end)).toBe("A dog barks.");
  });

  it("covers nothing on a blank line", () => {
    let state = caretAt(opened(), ACTION, 0);
    state = state.apply(state.tr.split(state.selection.head));
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, startOfElement(state, ACTION) )));
    expect(state.selection.$head.parent.textContent).toBe("");
    expect(commentRange(state)).toBeUndefined();
    expect(startComment(state)).toBeNull();
  });
});

describe("making a comment", () => {
  it("writes the remark into the opening delimiter round the words, and reads back the same", () => {
    const state = commented(select(opened(), LAST, 0, 25), "Does Maya hesitate first?");
    const file = fileOf(state);
    expect(file.split("\n").at(-2)).toBe(
      "[[c:1 Does Maya hesitate first?]]Maya pushes the door open[[/c:1]] and steps into the light.",
    );

    // What the bytes mean, not only that they survive.
    const reread = parse(file);
    expect(serialise(reread)).toBe(file);
    expect(census(reread)).toEqual(census(parse(SCRIPT)));
    expect(reread.comments.map((c) => [c.id, c.remark])).toEqual([["1", "Does Maya hesitate first?"]]);
    expect(covered(reread, "1")).toBe("Maya pushes the door open");
  });

  it("is a draft until the writer leaves its card: lit, drawn, and not in the file", () => {
    const state = run(caretAt(opened(), LAST, 3), startComment(caretAt(opened(), LAST, 3)));
    expect(shownComments(state)).toMatchObject([{ id: DRAFT_ID, draft: true, active: true }]);
    expect(activeComment(state)).toBe(DRAFT_ID);
    expect(fileOf(state)).toBe(SCRIPT);
    expect(state.doc.attrs["comments"]).toEqual([]);
  });

  it("goes quietly when left empty, and leaves nothing to undo", () => {
    const start = caretAt(opened(), LAST, 3);
    const depth = undoDepth(start);
    const drafted = run(start, startComment(start));
    const left = run(drafted, finishDraft(drafted, "   "));
    expect(shownComments(left)).toEqual([]);
    expect(fileOf(left)).toBe(SCRIPT);
    expect(undoDepth(left)).toBe(depth);
  });

  it("is one undo step, and Undo takes it away and Redo puts it back", () => {
    const made = commented(caretAt(opened(), LAST, 3), "Too easy.");
    expect(activeComment(made)).toBe("1");
    const undone = undoing(made);
    expect(fileOf(undone)).toBe(SCRIPT);
    expect(shownComments(undone)).toEqual([]);
    expect(fileOf(redoing(undone))).toBe(fileOf(made));
  });

  it("numbers each new comment one past the highest", () => {
    let state = commented(caretAt(opened(), ACTION, 0), "first");
    state = commented(caretAt(state, LAST, 0), "second");
    expect(state.doc.attrs["comments"].map((c: { id: string }) => c.id)).toEqual(["1", "2"]);
    expect(nextCommentId(opened("[[c:7 x]]Rain.[[/c:7]]\n"))).toBe("8");
  });
});

describe("a remark the file can hold", () => {
  it("is put on one line, and never holds the ]] that ends a note", () => {
    expect(SCREENPLAY_COMMENTS.fitRemark("cut this\nmove it")).toBe("cut this move it");
    // It ended in a bracket too, so a space follows that one as well.
    expect(SCREENPLAY_COMMENTS.fitRemark("see [[this]]")).toBe("see [[this] ] ");
    expect(SCREENPLAY_COMMENTS.fitRemark("odd]]]one")).toBe("odd] ] ]one");
    expect(PROSE_COMMENTS.fitRemark("  a\r\nb  ")).toBe("a b");
  });

  it("reads back as the remark written, ] and all", () => {
    for (const typed of ["see [[this]]", "ends in a bracket]", "odd]]]one"]) {
      const state = commented(caretAt(opened(), LAST, 0), typed);
      const reread = parse(fileOf(state));
      expect(reread.comments[0]!.remark).toBe(SCREENPLAY_COMMENTS.fitRemark(typed));
      expect(covered(reread, "1")).toBe("Maya pushes the door open and steps into the light.");
      expect(serialise(reread)).toBe(fileOf(state));
    }
  });
});

describe("rewording a comment", () => {
  it("rewrites the remark, one undo step, and Undo restores the old words", () => {
    const made = commented(caretAt(opened(), LAST, 0), "Too easy.");
    const reworded = run(made, setRemark(made, "1", "Does she hesitate?"));
    expect(parse(fileOf(reworded)).comments[0]!.remark).toBe("Does she hesitate?");
    expect(setRemark(reworded, "1", "Does she hesitate?")).toBeNull();
    expect(parse(fileOf(undoing(reworded))).comments[0]!.remark).toBe("Too easy.");
  });
});

describe("resolving a comment", () => {
  const before = `Rain.\n\n[[c:a1 Crows feel familiar.]]Crows lift off the fence.[[/c:a1]]\n`;

  it("deletes the comment and keeps every word it covered", () => {
    const state = opened(before);
    const resolved = run(state, resolveComment(state, "a1"));
    expect(fileOf(resolved)).toBe("Rain.\n\nCrows lift off the fence.\n");
    expect(census(parse(fileOf(resolved)))).toEqual(census(parse(before)));
    expect(shownComments(resolved)).toEqual([]);
  });

  it("comes back whole on Ctrl+Z, remark and span, byte for byte", () => {
    const state = opened(before);
    const resolved = run(state, resolveComment(state, "a1"));
    const restored = undoing(resolved);
    expect(fileOf(restored)).toBe(before);
    expect(shownComments(restored).map((c) => [c.id, c.remark, restored.doc.textBetween(c.start, c.end)])).toEqual([
      ["a1", "Crows feel familiar.", "Crows lift off the fence."],
    ]);
    // And the restored comment is kept on its words by later typing.
    const typed = restored.apply(restored.tr.insertText("Black ", startOfElement(restored, 1)));
    expect(fileOf(typed)).toBe(`Rain.\n\nBlack [[c:a1 Crows feel familiar.]]Crows lift off the fence.[[/c:a1]]\n`);
    expect(fileOf(redoing(restored))).toBe("Rain.\n\nCrows lift off the fence.\n");
  });

  it("lets a draft go without touching the file", () => {
    const start = caretAt(opened(), LAST, 0);
    const drafted = run(start, startComment(start));
    const gone = run(drafted, resolveComment(drafted, DRAFT_ID));
    expect(shownComments(gone)).toEqual([]);
    expect(fileOf(gone)).toBe(SCRIPT);
  });
});

describe("Undo after the words themselves were deleted", () => {
  it("brings the comment back with them", () => {
    const text = `Rain.\n\n[[c:a1 Crows.]]Crows lift off.[[/c:a1]]\n`;
    const state = opened(text);
    const base = startOfElement(state, 1);
    const deleted = state.apply(state.tr.delete(base, base + "Crows lift off.".length));
    expect(shownComments(deleted)).toEqual([]);
    expect(undoing(deleted).doc.attrs["comments"]).toEqual(state.doc.attrs["comments"]);
    expect(fileOf(undoing(deleted))).toBe(text);
  });
});

describe("which comment is lit", () => {
  const text = `[[c:a1 outer]]Rain [[c:b1 inner]]against[[/c:b1]] the window.[[/c:a1]]\n\nA dog barks.\n`;

  it("is the innermost round the caret, and none away from them", () => {
    const state = opened(text);
    expect(activeComment(caretAt(state, 0, 1))).toBe("a1");
    expect(activeComment(caretAt(state, 0, 7))).toBe("b1");
    expect(activeComment(caretAt(state, 1, 2))).toBeUndefined();
  });

  it("is the card's when one is chosen, and tints that comment's words more strongly", () => {
    const state = caretAt(opened(text), 1, 2);
    const lit = state.apply(activateComment(state, "b1"));
    expect(activeComment(lit)).toBe("b1");
    expect(shownComments(lit).map((c) => [c.id, c.active])).toEqual([["a1", false], ["b1", true]]);
    expect(fileOf(lit)).toBe(text);
  });
});

describe("nesting and crossing, made in the editor", () => {
  it("round-trips a crossing pair, ordered by id where two meet", () => {
    let state = commented(select(opened(), LAST, 0, 25), "outer");
    state = commented(select(state, LAST, 12, 35), "crossing");
    state = commented(select(state, LAST, 0, 4), "same start");
    const file = fileOf(state);
    expect(file.split("\n").at(-2)).toBe(
      "[[c:1 outer]][[c:3 same start]]Maya[[/c:3]] pushes [[c:2 crossing]]the door open[[/c:1]] and steps[[/c:2]] into the light.",
    );
    const reread = parse(file);
    expect(serialise(reread)).toBe(file);
    expect(census(reread)).toEqual(census(parse(SCRIPT)));
    expect(covered(reread, "2")).toBe("the door open and steps");
  });
});

describe("comments are not the script (ADR-0001, ADR-0017)", () => {
  const plain = parse(SCRIPT);
  let state = commented(select(opened(), LAST, 0, 25), "A remark long enough to move a page break if it were ever counted as text on the page.");
  state = commented(caretAt(state, ACTION, 0), "Another remark with many words in it, none of them the writer's script.");
  const withComments = manuscriptOf(state.doc);

  it("leaves the word count alone", () => {
    expect(withComments.comments).toHaveLength(2);
    expect(wordCount(withComments)).toBe(wordCount(plain));
  });

  it("leaves pagination alone", () => {
    expect(paginate(withComments).pageOfElement).toEqual(paginate(plain).pageOfElement);
  });

  it("is not in the clean Fountain copy", () => {
    expect(new TextDecoder().decode(fountainCopyOf(withComments))).toBe(SCRIPT);
  });

  it("is not on the PDF's pages", () => {
    expect(JSON.stringify(pdfPagesOf(withComments))).toBe(JSON.stringify(pdfPagesOf(plain)));
  });
});
