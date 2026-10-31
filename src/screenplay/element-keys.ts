/**
 * Enter, Tab, and splitting and joining lines (#43).
 *
 * The two keys a screenwriter uses most, following Final Draft (decided in
 * #37). Enter starts the element that normally comes next; Tab changes the
 * line the caret is on to the next type in the cycle; Enter in the middle of a
 * line splits it; Backspace at the very start of one joins it onto the line
 * above.
 *
 * This replaces `held-keys.ts`, which kept these keys inert so that the
 * browser could not split a `div` and hand the editing engine a second element
 * with no type. Nothing here leaves that door open: every element this file
 * makes is given its type by a rule written down below, never by default.
 *
 * ## Blank lines
 *
 * None of these keys writes spacing. Enter at the end of a line leaves an
 * empty element for the caret to stand in, and `manuscriptOf`
 * (`./editing.ts`) leaves empty elements out of the file; where the blank
 * lines fall on the way out is ADR-0019's spacing table, read off the types
 * either side. So a scene built entirely from keystrokes saves correctly
 * spaced without this file knowing what correct spacing is.
 *
 * Each command is exported on its own so the editing tests can run it with no
 * window (#37, seam 2); `elementKeys` binds them.
 */
import { closeHistory } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Plugin, TextSelection, type Command, type EditorState } from "prosemirror-state";
import type { Transaction } from "prosemirror-state";
import type { Attrs } from "prosemirror-model";
import type { ElementType } from "./document.ts";

/** What Enter at the end of an element starts, by the type it ends. */
const AFTER_ENTER: Partial<Record<ElementType, ElementType>> = {
  "scene-heading": "action",
  action: "action",
  character: "dialogue",
  dialogue: "action",
  parenthetical: "dialogue",
  transition: "scene-heading",
  centered: "scene-heading",
};

/** Anything the table does not name: a placeholder, to revisit (#43). */
const ENTER_FALLBACK: ElementType = "action";

/** What Enter at the end of an element of this type starts. */
export function typeAfter(type: ElementType): ElementType {
  return AFTER_ENTER[type] ?? ENTER_FALLBACK;
}

/** Tab's cycle, in order; the last goes back to the first. */
export const TAB_CYCLE: readonly ElementType[] = [
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

/** What Tab turns an element of this type into, or `undefined` outside the cycle. */
export function typeAfterTab(type: ElementType): ElementType | undefined {
  const at = TAB_CYCLE.indexOf(type);
  if (at === -1) return undefined;
  return TAB_CYCLE[(at + 1) % TAB_CYCLE.length];
}

/**
 * The attributes of an element of a different type, started or changed from
 * `from`'s. Only what is true of any line carries over: whether the line lies
 * inside a boneyard. A forcing marker, a scene
 * number, a section depth and a dual-dialogue caret are all facts about the
 * *old* type, and carrying one to a new type would write syntax the writer
 * never typed.
 */
function attrsForType(from: Attrs, type: ElementType): Attrs {
  return { type, omitted: from["omitted"] };
}

/**
 * Mark a transaction as a structural change — a new element, a type change, a
 * split or a join — so that it is an undo step of its own (#45, ADR-0019).
 *
 * `closeHistory` ends the typing run before it; `endsUndoStep` ends the step
 * after it, so typing that follows does not fold back into it.
 */
function structural(tr: Transaction): Transaction {
  return closeHistory(tr).setMeta(STRUCTURAL, true);
}

const STRUCTURAL = "write-ist:structural";

/** Closes the undo step after each structural change; see `structural`. */
export const endsUndoStep = new Plugin({
  appendTransaction: (transactions, _old, state) =>
    transactions.some((transaction) => transaction.getMeta(STRUCTURAL) === true)
      ? closeHistory(state.tr)
      : null,
});

/**
 * Enter — and Shift-Enter and Mod-Enter, which a screenplay has no second
 * meaning for.
 *
 * At the end of an element it starts the next type. Anywhere else it splits,
 * and both halves keep the type (and the forcing, so the second half still
 * reads back as what it is). A selection is replaced first, as a typed
 * character would.
 */
export const splitElement: Command = (state, dispatch) => {
  const tr = state.tr.deleteSelection();
  const at = tr.selection.$from;
  // In the title page, or anywhere that is not an element: do nothing, but
  // do it here — the browser would otherwise split the `div` itself.
  if (at.parent.type.name !== "element") return true;
  if (dispatch === undefined) return true;

  const type = at.parent.attrs["type"] as ElementType;
  if (at.parentOffset === at.parent.content.size) {
    tr.split(at.pos, 1, [
      {
        type: at.parent.type,
        attrs: attrsForType(at.parent.attrs, typeAfter(type)),
      },
    ]);
  } else {
    const { sceneNumber: _n, dual: _d, ...kept } = at.parent.attrs;
    tr.split(at.pos, 1, [{ type: at.parent.type, attrs: kept }]);
  }
  dispatch(structural(tr.scrollIntoView()));
  return true;
};

/**
 * Tab: change the line the caret is on — every line a selection touches — to
 * the next type in the cycle.
 *
 * It always claims the key, even where it changes nothing: a Tab that fell
 * through would move focus out of the editor mid-sentence.
 */
export const cycleType: Command = (state, dispatch) => {
  if (dispatch === undefined) return true;
  const { from, to } = state.selection;
  const tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "element") return node.type.name === "doc";
    const next = typeAfterTab(node.attrs["type"] as ElementType);
    if (next !== undefined) tr.setNodeMarkup(pos, undefined, attrsForType(node.attrs, next));
    return false;
  });
  if (tr.docChanged) dispatch(structural(tr));
  return true;
};

/**
 * Backspace at the very start of an element: join it onto the one above,
 * which keeps its type. Anywhere else the key is left to delete a character.
 */
export const joinBackwards: Command = (state, dispatch) => {
  const at = emptyCaret(state);
  if (at === undefined || at.parentOffset !== 0) return false;
  const before = at.index(0) > 0 ? at.doc.child(at.index(0) - 1) : undefined;
  // The first element has nothing above it to join; a title line above is not
  // an element to join onto.
  if (before === undefined || before.type.name !== "element")
    return at.parent.type.name === "element";
  if (dispatch !== undefined) dispatch(structural(joinAt(state, at.before())));
  return true;
};

/**
 * Delete at the very end of an element: pull the one below onto it, so the
 * upper keeps its type — the same join, from the other side.
 */
export const joinForwards: Command = (state, dispatch) => {
  const at = emptyCaret(state);
  if (at === undefined || at.parentOffset !== at.parent.content.size) return false;
  const after = at.index(0) + 1 < at.doc.childCount ? at.doc.child(at.index(0) + 1) : undefined;
  if (after === undefined || after.type.name !== "element")
    return at.parent.type.name === "element";
  if (dispatch !== undefined) dispatch(structural(joinAt(state, at.after())));
  return true;
};

/** Join the two elements either side of `boundary`, the upper surviving. */
function joinAt(state: EditorState, boundary: number) {
  const tr = state.tr.delete(boundary - 1, boundary + 1);
  return tr.setSelection(TextSelection.create(tr.doc, boundary - 1)).scrollIntoView();
}

/** The caret, if nothing is selected and it is in an element. */
function emptyCaret(state: EditorState) {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return undefined;
  const at = selection.$head;
  return at.parent.type.name === "element" ? at : undefined;
}

/** The keys, as one plugin. */
export const elementKeys = keymap({
  Enter: splitElement,
  "Shift-Enter": splitElement,
  "Mod-Enter": splitElement,
  Tab: cycleType,
  Backspace: joinBackwards,
  "Mod-Backspace": joinBackwards,
  Delete: joinForwards,
  "Mod-Delete": joinForwards,
});
