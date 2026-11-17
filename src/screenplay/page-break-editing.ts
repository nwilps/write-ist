/**
 * A forced page break inside the editor: a new sheet on the paper, never a
 * line of `===` (Fountain's forced page break, ADR-0021).
 *
 * The break stays an element of the editor's document, with its `===` as its
 * text, because that is what `manuscriptOf` reads back: the save, the autosave
 * and the Fountain copy all write it exactly as it was. What the paper shows
 * at the break is the seam to the next sheet (`sheets.ts`), which the layout
 * puts there; the `===` itself is not on the paper and not in the writer's
 * hands, as the title page is not (`title-page-editing.ts`):
 *
 *   - `hiddenPageBreak` draws a break as an empty, hidden placeholder, so no
 *     `===` is in the page's DOM.
 *   - `keepPageBreaksWhole` keeps the caret out of a break and refuses an edit
 *     that would type into one or join a line onto it. A break goes whole —
 *     by a selection across it, or by Backspace or Delete beside it
 *     (`joinBackwards`, `joinForwards`) — or not at all. Undo and redo are
 *     always let through: they only put back what was there.
 */
import { DOMSerializer, type Node as EditorNode } from "prosemirror-model";
import { Plugin, TextSelection, type EditorState } from "prosemirror-state";
import { isHistoryTransaction } from "prosemirror-history";
import type { NodeViewConstructor } from "prosemirror-view";

/** The text of a forced page break as the parser reads one. */
const BREAK = /^={3,}$/;

/** Is this node of the editor's document a forced page break? */
export function isPageBreak(node: EditorNode): boolean {
  return node.type.name === "element" && node.attrs["type"] === "page-break";
}

/**
 * Every element drawn as the schema draws it, except a page break: that is an
 * empty, hidden placeholder, present in the document and absent from the paper.
 */
export const hiddenPageBreak: Readonly<Record<string, NodeViewConstructor>> = {
  element: (node) => {
    if (!isPageBreak(node)) return DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
    const dom = document.createElement("div");
    dom.hidden = true;
    dom.setAttribute("data-element", "page-break");
    dom.setAttribute("data-page-break-hidden", "");
    dom.setAttribute("aria-hidden", "true");
    return { dom, ignoreMutation: () => true, stopEvent: () => true };
  },
};

/**
 * A position inside a page break, carried out of it: to the start of the next
 * line that is not a break when moving forward, else to the end of the one
 * before. `undefined` when it is not in a break, or there is nowhere to go.
 */
function outOfBreak(doc: EditorNode, position: number, forward: boolean): number | undefined {
  const $at = doc.resolve(position);
  if (!isPageBreak($at.parent)) return undefined;
  const index = $at.index(0);
  const step = forward ? 1 : -1;
  for (const direction of [step, -step]) {
    let pos = direction === 1 ? $at.after(1) : $at.before(1);
    for (let i = index + direction; i >= 0 && i < doc.childCount; i += direction) {
      const child = doc.child(i);
      if (direction === -1) pos -= child.nodeSize;
      if (child.type.name === "element" && !isPageBreak(child)) {
        return direction === 1 ? pos + 1 : pos + 1 + child.content.size;
      }
      if (direction === 1) pos += child.nodeSize;
    }
  }
  return undefined;
}

/** A selection with neither end inside a page break, or undefined when it already is. */
function clamped(state: EditorState, forward: boolean): TextSelection | undefined {
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return undefined;
  const anchor = outOfBreak(state.doc, selection.anchor, forward);
  const head = outOfBreak(state.doc, selection.head, forward);
  if (anchor === undefined && head === undefined) return undefined;
  return TextSelection.create(state.doc, anchor ?? selection.anchor, head ?? selection.head);
}

/** Where a caret starts in a document: its first line, unless that is a page break. */
export function outsidePageBreak(doc: EditorNode, selection: TextSelection): TextSelection {
  const head = outOfBreak(doc, selection.head, true);
  return head === undefined ? selection : TextSelection.create(doc, head);
}

/** Every break in the document still reads as one: `===` and nothing else. */
function breaksIntact(doc: EditorNode): boolean {
  let intact = true;
  doc.forEach((child) => {
    if (isPageBreak(child) && !BREAK.test(child.textContent)) intact = false;
  });
  return intact;
}

export const keepPageBreaksWhole = new Plugin({
  filterTransaction: (transaction) =>
    !transaction.docChanged || isHistoryTransaction(transaction) || breaksIntact(transaction.doc),
  appendTransaction: (_transactions, old, state) => {
    const selection = clamped(state, state.selection.head >= old.selection.head);
    return selection === undefined ? null : state.tr.setSelection(selection);
  },
});
