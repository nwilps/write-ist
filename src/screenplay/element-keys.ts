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
import type { Attrs, Node as EditorNode } from "prosemirror-model";
import { screenplaySchema } from "./schema.ts";
import type { ElementType } from "./document.ts";
import { gapBetween } from "./geometry.ts";

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
 * The syntax an element carries *after* its text that the editor does not show:
 * a cue's dual-dialogue caret and a heading's scene number, as the file spells
 * them. Both are attributes of the element (ADR-0019), so they live and die
 * with it — and an edit that makes the element stop being what they belong to
 * would otherwise delete them without a word. Where that happens they are put
 * into the text instead, byte for byte as they were on disk (ADR-0020: the app
 * never silently changes what the writer wrote).
 */
function hiddenSuffix(attrs: Attrs): string {
  const dual = attrs["dual"] === true ? " ^" : "";
  const number = typeof attrs["sceneNumber"] === "string" ? ` #${attrs["sceneNumber"] as string}#` : "";
  return dual + number;
}

/** Write an element's hidden suffix at the end of its text, if it has one. */
function spellOutSuffix(tr: Transaction, node: EditorNode, pos: number): void {
  const suffix = hiddenSuffix(node.attrs);
  if (suffix === "") return;
  tr.insert(tr.mapping.map(pos + 1 + node.content.size), screenplaySchema.text(suffix));
}

/**
 * Change an element's type, keeping its hidden suffix as text (see
 * `hiddenSuffix`). The type is always different from the old one here, and the
 * caret and the scene number each belong to exactly one type.
 */
function retype(tr: Transaction, node: EditorNode, pos: number, type: ElementType): void {
  tr.setNodeMarkup(tr.mapping.map(pos), undefined, attrsForType(node.attrs, type));
  spellOutSuffix(tr, node, pos);
}

/**
 * Mark a transaction as a structural change — a new element, a type change, a
 * split or a join — so that it is an undo step of its own (#45, ADR-0019).
 *
 * `closeHistory` ends the typing run before it; `endsUndoStep` ends the step
 * after it, so typing that follows does not fold back into it.
 */
export function structural(tr: Transaction): Transaction {
  return closeHistory(tr).setMeta(STRUCTURAL, true);
}

const STRUCTURAL = "write-ist:structural";

/** Set by a join that has already written the lower line's hidden syntax into its text. */
const SPELLED = "write-ist:spelled";

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
  if (restoreGap(state, dispatch)) return true;
  const tr = state.tr.deleteSelection();
  const at = tr.selection.$from;
  // In the title page, or anywhere that is not an element: do nothing, but
  // do it here — the browser would otherwise split the `div` itself.
  if (at.parent.type.name !== "element") return true;
  if (dispatch === undefined) return true;

  const type = at.parent.attrs["type"] as ElementType;
  // The second half is a new element with a gap of its own above it: whatever
  // squish the first half carries stays with the first (ADR-0038).
  if (at.parentOffset === at.parent.content.size) {
    tr.split(at.pos, 1, [
      {
        type: at.parent.type,
        attrs: attrsForType(at.parent.attrs, typeAfter(type)),
      },
    ]);
  } else if (at.parentOffset === 0) {
    // The whole line moves down and an empty one is left above it, so the
    // hidden suffix goes with the text it belongs to.
    tr.split(at.pos, 1, [{ type: at.parent.type, attrs: { ...at.parent.attrs, squished: false } }]);
    const { sceneNumber: _n, dual: _d, ...kept } = at.parent.attrs;
    tr.setNodeMarkup(at.before(), undefined, kept);
  } else {
    const { sceneNumber: _n, dual: _d, ...kept } = at.parent.attrs;
    tr.split(at.pos, 1, [{ type: at.parent.type, attrs: { ...kept, squished: false } }]);
  }
  dispatch(structural(tr.scrollIntoView()));
  return true;
};

/**
 * Enter at the very end of the upper element of a squished pair: put the gap
 * back to the table's default, and nothing else. No element is made and the
 * caret stays exactly where it was (ADR-0038). Anywhere else, or when the gap
 * is not squished, Enter is not this command's.
 */
function restoreGap(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined): boolean {
  const at = emptyCaret(state);
  if (at === undefined || at.parentOffset !== at.parent.content.size) return false;
  const index = at.index(0);
  const below = index + 1 < at.doc.childCount ? at.doc.child(index + 1) : undefined;
  if (below === undefined || below.type.name !== "element" || below.attrs["squished"] !== true) {
    return false;
  }
  const squishable = gapBetween(
    at.parent.attrs["type"] as ElementType,
    below.attrs["type"] as ElementType,
  ).squishable;
  if (!squishable) return false;
  if (dispatch !== undefined) {
    const tr = state.tr.setNodeMarkup(at.after(), undefined, { ...below.attrs, squished: false });
    dispatch(structural(tr));
  }
  return true;
}

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
    if (next !== undefined) retype(tr, node, pos, next);
    return false;
  });
  if (tr.docChanged) dispatch(structural(tr));
  return true;
};

/**
 * The element types a writer can ask for by number, in the order the desk's
 * element panel lists them: Ctrl+1 is a scene heading, Ctrl+7 centred text.
 */
export const NUMBERED_TYPES: readonly ElementType[] = [
  "scene-heading",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
  "centered",
];

/**
 * Make every element the selection touches this type.
 *
 * The same move as Tab, to a type named rather than the next in the cycle, and
 * one undo step like it. The title page is not an element and is left alone.
 */
export function setElementType(type: ElementType): Command {
  return (state, dispatch) => {
    if (dispatch === undefined) return true;
    const { from, to } = state.selection;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name !== "element") return node.type.name === "doc";
      if (node.attrs["type"] !== type) retype(tr, node, pos, type);
      return false;
    });
    if (tr.docChanged) dispatch(structural(tr));
    return true;
  };
}

/**
 * Backspace at the very start of an element: join it onto the one above,
 * which keeps its type. Anywhere else the key is left to delete a character.
 */
export const joinBackwards: Command = (state, dispatch) => {
  const at = emptyCaret(state);
  if (at === undefined || at.parentOffset !== 0) return false;
  const before = at.index(0) > 0 ? at.doc.child(at.index(0) - 1) : undefined;
  if (before !== undefined && squishesGap(before, at.parent)) {
    if (dispatch !== undefined) {
      const tr = state.tr.setNodeMarkup(at.before(), undefined, { ...at.parent.attrs, squished: true });
      dispatch(structural(tr));
    }
    return true;
  }
  // The first element has nothing above it to join; a title line above is not
  // an element to join onto.
  if (before === undefined || before.type.name !== "element")
    return at.parent.type.name === "element";
  if (dispatch !== undefined) dispatch(structural(joinAt(state, at.before(), at.parent)));
  return true;
};

/**
 * Does Backspace at the start of `lower` squish the gap rather than join? Only
 * where the table lets the pair be squished, the gap is not already, and there
 * is text to leave in place: an empty line is deleted as before.
 */
function squishesGap(upper: EditorNode, lower: EditorNode): boolean {
  return (
    upper.type.name === "element" &&
    lower.attrs["squished"] !== true &&
    lower.content.size > 0 &&
    gapBetween(upper.attrs["type"] as ElementType, lower.attrs["type"] as ElementType).squishable
  );
}

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
  if (dispatch !== undefined) dispatch(structural(joinAt(state, at.after(), after)));
  return true;
};

/**
 * Join the two elements either side of `boundary`, the upper surviving. The
 * lower one's hidden suffix is spelled out first, so it is not lost with its
 * element.
 */
function joinAt(state: EditorState, boundary: number, lower: EditorNode) {
  const tr = state.tr;
  spellOutSuffix(tr, lower, boundary);
  tr.setMeta(SPELLED, true);
  tr.delete(boundary - 1, boundary + 1);
  return tr.setSelection(TextSelection.create(tr.doc, boundary - 1)).scrollIntoView();
}

/** The caret, if nothing is selected and it is in an element. */
function emptyCaret(state: EditorState) {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return undefined;
  const at = selection.$head;
  return at.parent.type.name === "element" ? at : undefined;
}

/**
 * A deletion that joins one line onto another by taking out a stretch that
 * spans the break — a multi-line selection deleted, typed over, or cut — ends
 * the lower element, and with it the syntax it carried after its text. If any
 * of that lower line's text survives onto the line above, the syntax is
 * written into it, as `joinAt` does for Backspace; if the whole of it was
 * selected, it was deleted with its caret, and the caret goes too.
 */
export const keepHiddenSyntax = new Plugin({
  appendTransaction: (transactions, _old, state) => {
    const found: number[] = [];
    const suffixes: string[] = [];
    transactions.forEach((transaction, t) => {
      // Undo and redo replay the appended text with the step that caused it.
      if (transaction.getMeta("history$") !== undefined) return;
      if (transaction.getMeta(SPELLED) === true) return;
      transaction.steps.forEach((_step, s) => {
        const before = transaction.docs[s]!;
        const after = transaction.docs[s + 1] ?? transaction.doc;
        transaction.mapping.maps[s]!.forEach((from, to, newFrom, newTo) => {
          const $from = before.resolve(from);
          const $to = before.resolve(to);
          if ($from.parent === $to.parent) return;
          if ($from.parent.type.name !== "element" || $to.parent.type.name !== "element") return;
          // Only a plain deletion or typing-over, where what goes in is text
          // inside one line: a structural paste carries its own elements.
          if (after.resolve(newFrom).parent !== after.resolve(newTo).parent) return;
          const suffix = hiddenSuffix($to.parent.attrs);
          if (suffix === "" || $to.parentOffset === $to.parent.content.size) return;

          // Where the lower line's text now begins, carried through what follows.
          let position = transaction.mapping.slice(s + 1).map(newTo);
          for (const later of transactions.slice(t + 1)) position = later.mapping.map(position);
          found.push(position);
          suffixes.push(suffix);
        });
      });
    });
    if (found.length === 0) return null;

    const tr = state.tr;
    const order = found.map((_p, i) => i).sort((a, b) => found[b]! - found[a]!);
    for (const i of order) {
      const $at = tr.doc.resolve(Math.min(found[i]!, tr.doc.content.size));
      if ($at.parent.type.name !== "element") continue;
      tr.insert($at.end(), screenplaySchema.text(suffixes[i]!));
    }
    return tr.docChanged ? tr : null;
  },
});

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
  ...Object.fromEntries(NUMBERED_TYPES.map((type, at) => [`Mod-${at + 1}`, setElementType(type)])),
});
