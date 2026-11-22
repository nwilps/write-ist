/**
 * A forced page break inside the editor (Fountain's `===`, ADR-0021): a new
 * sheet on the paper the moment it is typed, and a line of `===` the writer can
 * see and take out (Noah, 2026-11-21).
 *
 * The break is an element of the editor's document with its `===` as its text,
 * because that is what `manuscriptOf` reads back: the save, the autosave and
 * the Fountain copy all write it exactly as it was. The layout gives it no row
 * (`paginate.ts`), so it is never printed and never moves a page; the paper
 * draws its `===` faintly in the room the break leaves, without taking a row
 * either (`editor.css`), so the sheets still match the PDF line for line.
 *
 * **The break follows its text**, in both directions, as the writer types:
 *
 *   - a line typed to read `===` (three or more `=` and nothing else) becomes
 *     a break, and the next line starts a new sheet at once;
 *   - a break whose `===` is no longer that — a `=` deleted, a letter typed —
 *     is an action line again, and the sheet closes up at once.
 *
 * Either change rides in the keystroke's own transaction, so Undo takes the
 * keystroke and the break back together. Nothing is announced: the sheet
 * changing is the answer. A line only ever changes because it was edited —
 * an imported `!===`, a forced action line, is left as the file has it.
 *
 * Backspace or Delete *beside* a break takes it out whole (`joinBackwards`,
 * `joinForwards`), and so does the paper's right-click Remove Page Break.
 */
import type { Node as EditorNode } from "prosemirror-model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { isHistoryTransaction } from "prosemirror-history";

/** The text of a forced page break as the parser reads one (`parse.ts`). */
const BREAK = /^={3,}$/;

/** Is this node of the editor's document a forced page break? */
export function isPageBreak(node: EditorNode): boolean {
  return node.type.name === "element" && node.attrs["type"] === "page-break";
}

/**
 * Whether an edited line should now be a break: it reads `===`, and is a
 * line the writer can type a break into. Not a forced action (`!===` is the
 * file's way of saying "not a break"), not cut material, and not a line that
 * carries hidden syntax of its own (a dual cue's `^`, a heading's number),
 * which retyping would lose.
 */
function becomesBreak(node: EditorNode): boolean {
  return (
    node.type.name === "element" &&
    !isPageBreak(node) &&
    BREAK.test(node.textContent) &&
    node.attrs["forced"] !== true &&
    node.attrs["omitted"] !== true &&
    node.attrs["dual"] !== true &&
    typeof node.attrs["sceneNumber"] !== "string"
  );
}

/** Whether a break has been edited out of being one. */
function stopsBeingBreak(node: EditorNode): boolean {
  return isPageBreak(node) && !BREAK.test(node.textContent);
}

/** Where a caret starts in a document: its first line, unless that is a page break. */
export function outsidePageBreak(doc: EditorNode, selection: TextSelection): TextSelection {
  const $head = doc.resolve(selection.head);
  if ($head.depth === 0 || !isPageBreak($head.parent)) return selection;
  for (let i = $head.index(0) + 1, pos = $head.after(1); i < doc.childCount; pos += doc.child(i).nodeSize, i++) {
    const child = doc.child(i);
    if (child.type.name === "element" && !isPageBreak(child)) return TextSelection.create(doc, pos + 1);
  }
  return selection;
}

/** The top-level indexes an edit touched, in the document as it now is. */
function touched(transactions: readonly Transaction[], doc: EditorNode): Set<number> {
  const found = new Set<number>();
  const size = doc.content.size;
  for (const transaction of transactions) {
    transaction.mapping.maps.forEach((map, at) => {
      const rest = transaction.mapping.slice(at + 1);
      map.forEach((_s, _e, from, to) => {
        const start = Math.min(rest.map(from, -1), size);
        const end = Math.min(Math.max(rest.map(to, 1), start), size);
        const first = doc.resolve(start).index(0);
        const last = doc.resolve(end).index(0);
        for (let i = first; i <= last && i < doc.childCount; i++) found.add(i);
      });
    });
  }
  return found;
}

export const pageBreaksFollowText = new Plugin({
  appendTransaction: (transactions, _old, state) => {
    // Undo and redo put back a line and its type together.
    if (!transactions.some((tr) => tr.docChanged && !isHistoryTransaction(tr))) return null;
    const tr = state.tr;
    let pos = 0;
    const lines = touched(transactions, state.doc);
    state.doc.forEach((node, offset, index) => {
      pos = offset;
      if (!lines.has(index)) return;
      if (becomesBreak(node)) tr.setNodeMarkup(pos, undefined, { type: "page-break", omitted: node.attrs["omitted"] });
      else if (stopsBeingBreak(node)) tr.setNodeMarkup(pos, undefined, { type: "action", omitted: node.attrs["omitted"] });
    });
    return tr.docChanged ? tr : null;
  },
});

/** The break the place `at` is on, with where it starts; `undefined` when it is not on one. */
export function breakAt(state: EditorState, at: number): { node: EditorNode; pos: number } | undefined {
  if (at < 0 || at > state.doc.content.size) return undefined;
  const $at = state.doc.resolve(at);
  if ($at.depth >= 1 && isPageBreak($at.parent)) return { node: $at.parent, pos: $at.before(1) };
  // Between elements: the line that starts here.
  const after = $at.depth === 0 ? $at.nodeAfter : null;
  return after !== null && isPageBreak(after) ? { node: after, pos: at } : undefined;
}

/** Whether the place `at` — the caret, or where the paper was right-clicked — is on a break. */
export function canRemovePageBreak(state: EditorState, at: number): boolean {
  return breakAt(state, at) !== undefined;
}

/**
 * Where a click on the paper landed, when it landed on a break's `===`.
 *
 * The break takes no height on the paper (`editor.css`), so its line is drawn
 * outside its own box, and WebKit answers a point on it with the place *after*
 * the break, though it says the break is the node the point is `inside`. That
 * place is the next sheet's first line: the right-click menu would not offer
 * Remove Page Break, and the caret would jump past the line clicked. So a
 * point inside a break is taken to the end of its `===`. Anything else is
 * answered as it was found.
 */
export function placeOnBreak(doc: EditorNode, found: { pos: number; inside: number }): number {
  if (found.inside < 0) return found.pos;
  const node = doc.nodeAt(found.inside);
  if (node === null || !isPageBreak(node)) return found.pos;
  const start = found.inside + 1;
  const end = start + node.content.size;
  return found.pos >= start && found.pos <= end ? found.pos : end;
}
