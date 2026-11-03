/**
 * The title page inside the editor, out of sight (slice 2, step 4).
 *
 * The title page stays in the editor's document, ahead of the first element,
 * because that is the one place `manuscriptOf` already reads it back from: the
 * save, the autosave, the Fountain copy and the ledger all see it, and the
 * file's title page comes out exactly as it went in. What changes is that it is
 * **not on the paper** and **not reachable by the writer's hands**:
 *
 *   - `hiddenTitlePage` draws each title line as an empty, hidden placeholder, so
 *     no title-page text is in the page's DOM.
 *   - `keepTitlePageOut` keeps the caret and every selection inside the script,
 *     and refuses any edit that would reach into the title lines — Backspace at
 *     the start of the first element would otherwise join it onto the last title
 *     line. The only things allowed to change them are the dialog's Save
 *     (`setTitlePage`) and undo and redo of that Save.
 */
import { Plugin, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { isHistoryTransaction, closeHistory } from "prosemirror-history";
import type { Node as EditorNode } from "prosemirror-model";
import type { NodeViewConstructor } from "prosemirror-view";
import type { TitlePageField } from "./document.ts";
import { fromEditorDocument, toEditorDocument } from "./editor.ts";

/** Marks the transaction that is the dialog's Save. */
const savedFromDialog = "write-ist:title-page";

/** Where the title lines end: the position just before the first element. */
export function titleEnd(doc: EditorNode): number {
  let end = 0;
  for (let at = 0; at < doc.childCount; at++) {
    const child = doc.child(at);
    if (child.type.name !== "title_line") break;
    end += child.nodeSize;
  }
  return end;
}

/** The title page, as the model holds it. */
export function titlePageOf(doc: EditorNode): readonly TitlePageField[] {
  return fromEditorDocument(doc).titlePage;
}

/** A title line drawn as nothing: present in the document, absent from the paper. */
export const hiddenTitlePage: Readonly<Record<string, NodeViewConstructor>> = {
  title_line: () => {
    const dom = document.createElement("div");
    dom.hidden = true;
    dom.setAttribute("data-title-hidden", "");
    dom.setAttribute("aria-hidden", "true");
    return { dom, ignoreMutation: () => true, stopEvent: () => true };
  },
};

/** A selection's start inside the script, or undefined when it already is. */
const clamped = (state: EditorState): TextSelection | undefined => {
  const end = titleEnd(state.doc);
  if (end === 0 || state.selection.from > end) return undefined;
  const from = Math.min(end + 1, state.doc.content.size);
  return TextSelection.create(state.doc, from, Math.max(from, state.selection.to));
};

/** Where a caret starts: the first element, never the title page above it. */
export function startOfScript(doc: EditorNode): TextSelection {
  return TextSelection.create(doc, Math.min(titleEnd(doc) + 1, doc.content.size));
}

export const keepTitlePageOut = new Plugin({
  filterTransaction: (transaction, state) => {
    if (!transaction.docChanged) return true;
    if (transaction.getMeta(savedFromDialog) === true || isHistoryTransaction(transaction)) return true;
    const before = titleEnd(state.doc);
    const after = titleEnd(transaction.doc);
    return before === after && state.doc.content.cut(0, before).eq(transaction.doc.content.cut(0, after));
  },
  appendTransaction: (_transactions, _old, state) => {
    const selection = clamped(state);
    return selection === undefined ? null : state.tr.setSelection(selection);
  },
});

/**
 * The transaction that writes `titlePage` over the old one, or nothing when it
 * says the same. One step, one undo group: Undo after Save restores the old
 * title page in one go.
 */
export function setTitlePage(state: EditorState, titlePage: readonly TitlePageField[]): Transaction {
  const written = toEditorDocument({ titlePage, elements: [], comments: [], endsWithNewline: false });
  const transaction = state.tr.replaceWith(0, titleEnd(state.doc), written.content);
  transaction.setMeta(savedFromDialog, true);
  return closeHistory(transaction);
}
