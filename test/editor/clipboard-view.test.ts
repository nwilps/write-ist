// @vitest-environment jsdom
/**
 * The clipboard handlers as the view runs them (#47): what ProseMirror's own
 * copy pipeline puts on the clipboard, read back by paste. jsdom stands in for
 * the DOM the serializer needs; nothing is drawn or typed.
 */
import { describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { pasteTransaction } from "../../src/screenplay/clipboard.ts";
import { editorStateFor, manuscriptOf } from "../../src/screenplay/editing.ts";
import { parse } from "../../src/screenplay/parse.ts";
import { serialise } from "../../src/screenplay/serialise.ts";
import { startOfElement } from "../support/editor-positions.ts";

describe("the view's copy pipeline", () => {
  it("carries the model through html, and text/plain is Fountain", () => {
    const state = editorStateFor(parse("BOB\nIs it **ready**?\n\nShe waits.\n"));
    const view = new EditorView(document.createElement("div"), { state });
    const from = startOfElement(state, 0);
    const to = startOfElement(state, 2) + "She waits.".length;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));

    const { dom, text } = view.serializeForClipboard(view.state.selection.content());
    expect(text).toBe("BOB\nIs it **ready**?\n\nShe waits.");

    const into = editorStateFor(parse("Start.\n"));
    const tr = pasteTransaction(into, { text, html: dom.innerHTML });
    expect(serialise(manuscriptOf(into.apply(tr!).doc))).toBe(
      "BOB\nIs it **ready**?\n\nShe waits.\n\nStart.\n",
    );
    view.destroy();
  });
});
