/**
 * @vitest-environment jsdom
 *
 * The title page is not on the paper (slice 2, step 4): in the file, in the
 * document, never in the Editor's DOM, never reachable by the caret, and
 * changed only by the dialog's Save — which is one Undo.
 */
import { undo } from "prosemirror-history";
import { TextSelection, type EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { joinBackwards } from "../../src/screenplay/element-keys.ts";
import { layout } from "../../src/screenplay/layout.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import {
  hiddenTitlePage,
  setTitlePage,
  titleEnd,
  titlePageOf,
} from "../../src/screenplay/title-page-editing.ts";
import { startOfElement } from "../support/editor-positions.ts";

const FOUNTAIN = "Title: Big Fish\nAuthor: John August\n\nINT. KITCHEN - DAY\n\nHe waits.\n";

function mounted(text = FOUNTAIN) {
  let state = editorStateFor(parse(text));
  const view = new EditorView(document.createElement("div"), {
    state,
    nodeViews: hiddenTitlePage,
    dispatchTransaction: (tr) => {
      state = state.apply(tr);
      view.updateState(state);
    },
  });
  return { view, state: () => state };
}

describe("the Editor's page", () => {
  it("holds no title-page text and starts at the first element", () => {
    const { view } = mounted();
    expect(view.dom.textContent).not.toContain("Big Fish");
    expect(view.dom.textContent).not.toContain("John August");
    const visible = [...view.dom.children].filter((child) => !(child as HTMLElement).hidden);
    expect(visible.map((child) => child.getAttribute("data-element"))).toEqual(["scene-heading", "action"]);
    expect(visible[0]!.textContent).toBe("INT. KITCHEN - DAY");
  });

  it("does not count toward the page count", () => {
    const withIt = parse(FOUNTAIN);
    const without = { ...withIt, titlePage: [] };
    expect(layout(manuscriptOf(editorStateFor(withIt).doc)).totalPages).toBe(layout(without).totalPages);
  });

  it("keeps the title page in the file, untouched", () => {
    const { state } = mounted();
    expect(serialise(manuscriptOf(state().doc))).toBe(FOUNTAIN);
  });

  it("puts the caret in the script, and keeps it there", () => {
    const { view, state } = mounted();
    expect(state().selection.from).toBe(startOfElement(state(), 0));
    // Select everything, and try to put the caret back on a title line.
    view.dispatch(state().tr.setSelection(TextSelection.create(state().doc, 1)));
    expect(state().selection.from).toBe(startOfElement(state(), 0));
  });

  it("refuses an edit that reaches into the title page", () => {
    const { view, state } = mounted();
    const before = state().doc;
    // Backspace at the start of the first element would join it onto the last title line.
    joinBackwards(state(), view.dispatch);
    expect(state().doc.eq(before)).toBe(true);
    view.dispatch(state().tr.delete(0, titleEnd(state().doc) + 3));
    expect(state().doc.eq(before)).toBe(true);
  });
});

describe("saving the title page from the dialog", () => {
  it("writes the new title page into the file and leaves the script alone", () => {
    const { view, state } = mounted();
    const fields = parse("Title: Big Fish\nCredit: by\nAuthor: Me\n\nx").titlePage;
    view.dispatch(setTitlePage(state(), fields));
    expect(serialise(manuscriptOf(state().doc))).toBe(
      "Title: Big Fish\nCredit: by\nAuthor: Me\n\nINT. KITCHEN - DAY\n\nHe waits.\n",
    );
    expect(titlePageOf(state().doc).map((f) => f.key)).toEqual(["Title", "Credit", "Author"]);
    expect(state().selection.from).toBeGreaterThan(titleEnd(state().doc));
  });

  it("is one Undo", () => {
    const { view, state } = mounted();
    const fields = parse("Title: New\nSource: s\n\nx").titlePage;
    view.dispatch(setTitlePage(state(), fields));
    undo(state() as EditorState, view.dispatch);
    expect(serialise(manuscriptOf(state().doc))).toBe(FOUNTAIN);
  });

  it("can empty the title page, and write one onto a script that had none", () => {
    const { view, state } = mounted();
    view.dispatch(setTitlePage(state(), []));
    expect(serialise(manuscriptOf(state().doc))).toBe("INT. KITCHEN - DAY\n\nHe waits.\n");
    view.dispatch(setTitlePage(state(), parse("Title: Back\n\nx").titlePage));
    expect(serialise(manuscriptOf(state().doc))).toBe("Title: Back\n\nINT. KITCHEN - DAY\n\nHe waits.\n");
  });

  it("keeps a comment on the words it was left on", () => {
    const text = "Title: a\n\nHe [[waits]] here.\n";
    const { view, state } = mounted(text);
    view.dispatch(setTitlePage(state(), parse("Title: a much longer title\nAuthor: me\n\nx").titlePage));
    expect(serialise(manuscriptOf(state().doc))).toBe(
      "Title: a much longer title\nAuthor: me\n\nHe [[waits]] here.\n",
    );
  });
});
