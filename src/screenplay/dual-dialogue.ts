/**
 * Dual dialogue: the commands that make a pair, undo one and turn one round,
 * and the typed `^`.
 *
 * What makes a pair is `pairing.ts`'s: these only act on its answers. The
 * pagination engine asks the same rules, so the paper, the count and the
 * commands cannot disagree about which speeches are paired.
 *
 * Each command takes a document position — anywhere in either speech — and is
 * a single undo step. They are named commands, ready for a context menu to
 * call (ADR-0034); no menu and no key is bound here. The `can…` form of each
 * answers whether the command would do anything, so a menu can grey the item
 * out.
 */
import { Fragment, type Node as EditorNode } from "prosemirror-model";
import { Plugin, TextSelection, type Command, type EditorState, type Transaction } from "prosemirror-state";
import type { Comment } from "../comments.ts";
import { pastedComments, type PastedComment } from "./clipboard.ts";
import type { ElementType } from "./document.ts";
import { structural } from "./element-keys.ts";
import { caretToPair, pairOf, speechAt, type DualPair, type Speech, type SpeechItem } from "./pairing.ts";
import { positionOfElement } from "./place.ts";

/* --------------------------------------------------------------- the model */

/** One manuscript element in the editor's document. */
interface Entry {
  readonly pos: number;
  readonly node: EditorNode;
}

/** The elements that are in the file: blank lines the writer stands on are not. */
function entriesOf(doc: EditorNode): Entry[] {
  const entries: Entry[] = [];
  let pos = 0;
  doc.forEach((node) => {
    if (node.type.name === "element" && node.content.size > 0) entries.push({ pos, node });
    pos += node.nodeSize;
  });
  return entries;
}

const itemOf = ({ node }: Entry): SpeechItem => ({
  type: node.attrs["type"] as ElementType,
  dual: node.attrs["dual"] === true,
  omitted: node.attrs["omitted"] === true,
});

/** Everything the commands ask about, worked out once. */
interface Situation {
  readonly entries: readonly Entry[];
  readonly items: readonly SpeechItem[];
  /** The speech `at` is in, as pairing names it. */
  readonly speech: number | undefined;
}

function situation(state: EditorState, at: number): Situation {
  const entries = entriesOf(state.doc);
  const items = entries.map(itemOf);
  const index = entries.findIndex(({ pos, node }) => at >= pos && at <= pos + node.nodeSize);
  return { entries, items, speech: index === -1 ? undefined : speechAt(items, index) };
}

/** Which cue to put the caret on to pair the speech at `at`. */
const planDual = (s: Situation, directions: readonly (-1 | 1)[]): Speech | undefined =>
  s.speech === undefined ? undefined : caretToPair(s.items, s.speech, directions);

const pairAt = (s: Situation): DualPair | undefined =>
  s.speech === undefined ? undefined : pairOf(s.items, s.speech);

/* ---------------------------------------------------------------- commands */

/**
 * Can the speech at `at` be made one half of a dual pair? Only if it is not
 * already in one and the speech directly above — or, failing that, directly
 * below — touches it and is not in one either.
 */
export function canMakeDualDialogue(state: EditorState, at: number): boolean {
  return planDual(situation(state, at), [-1, 1]) !== undefined;
}

/**
 * Pair the speech at `at` with the one directly above it, or if that is not
 * possible the one directly below: the later of the two gets the caret.
 */
export function makeDualDialogue(at: number): Command {
  return (state, dispatch) => {
    const s = situation(state, at);
    const cue = planDual(s, [-1, 1]);
    if (cue === undefined) return false;
    if (dispatch !== undefined) dispatch(structural(withCaret(state.tr, s, cue, true)));
    return true;
  };
}

function withCaret(tr: Transaction, s: Situation, speech: Speech, dual: boolean): Transaction {
  const entry = s.entries[speech.cue]!;
  return tr.setNodeMarkup(entry.pos, undefined, { ...entry.node.attrs, dual });
}

/** Is the speech at `at` one half of a pair? */
export function canMakeNormalDialogue(state: EditorState, at: number): boolean {
  return pairAt(situation(state, at)) !== undefined;
}

/** Take the pair at `at` apart: the caret comes off, and the speeches stack. */
export function makeNormalDialogue(at: number): Command {
  return (state, dispatch) => {
    const s = situation(state, at);
    const pair = pairAt(s);
    if (pair === undefined) return false;
    if (dispatch !== undefined) dispatch(structural(withCaret(state.tr, s, pair.right, false)));
    return true;
  };
}

/** Is the speech at `at` one half of a pair, which can be turned round? */
export function canSwapSpeakers(state: EditorState, at: number): boolean {
  return canMakeNormalDialogue(state, at);
}

/**
 * Swap the pair at `at`: the right-hand speech comes first in the script and
 * the caret moves to the speech that is now second.
 *
 * It is a change to the order of the file, so it is done as one replacement of
 * the two speeches. A comment anchored wholly inside one of them travels with
 * its words, and the caret, if it was in the pair, stays on the same word.
 */
export function swapSpeakers(at: number): Command {
  return (state, dispatch) => {
    const s = situation(state, at);
    const pair = pairAt(s);
    if (pair === undefined) return false;
    if (dispatch === undefined) return true;

    const { doc } = state;
    const first = s.entries[pair.left.cue]!;
    const lastOfLeft = s.entries[pair.left.end]!;
    const second = s.entries[pair.right.cue]!;
    const last = s.entries[pair.right.end]!;
    const leftFrom = first.pos;
    const leftTo = lastOfLeft.pos + lastOfLeft.node.nodeSize;
    const rightFrom = second.pos;
    const rightTo = last.pos + last.node.nodeSize;

    const childrenBetween = (from: number, to: number): EditorNode[] => {
      const nodes: EditorNode[] = [];
      doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name === "doc") return true;
        if (pos >= from && pos + node.nodeSize <= to) nodes.push(node);
        return false;
      });
      return nodes;
    };
    const withDual = (nodes: EditorNode[], dual: boolean): EditorNode[] =>
      nodes.map((node, index) =>
        index === 0 ? node.type.create({ ...node.attrs, dual }, node.content, node.marks) : node,
      );

    const leftNodes = withDual(childrenBetween(leftFrom, leftTo), true);
    const middleNodes = childrenBetween(leftTo, rightFrom);
    const rightNodes = withDual(childrenBetween(rightFrom, rightTo), false);
    const size = (nodes: EditorNode[]): number => nodes.reduce((n, node) => n + node.nodeSize, 0);

    const tr = state.tr.replaceWith(
      leftFrom,
      rightTo,
      Fragment.fromArray([...rightNodes, ...middleNodes, ...leftNodes]),
    );

    // Where each block starts now.
    const movedRight = leftFrom - rightFrom;
    const movedLeft = leftFrom + size(rightNodes) + size(middleNodes) - leftFrom;

    const head = state.selection.head;
    if (state.selection.empty && head >= leftFrom && head <= leftTo) {
      tr.setSelection(TextSelection.create(tr.doc, head + movedLeft));
    } else if (state.selection.empty && head >= rightFrom && head <= rightTo) {
      tr.setSelection(TextSelection.create(tr.doc, head + movedRight));
    }

    const carried = commentsToCarry(doc, [
      [leftFrom, leftTo, movedLeft],
      [rightFrom, rightTo, movedRight],
    ]);
    if (carried.length > 0) tr.setMeta(pastedComments, carried);

    dispatch(structural(tr.scrollIntoView()));
    return true;
  };
}

/**
 * The comments wholly inside one of the moved blocks, as they stand after the
 * move. Replacing the blocks drops every comment anchored in them (their words
 * are gone from where they were), so these are put back in the new places.
 */
function commentsToCarry(
  doc: EditorNode,
  blocks: readonly (readonly [from: number, to: number, by: number])[],
): PastedComment[] {
  const held = doc.attrs["comments"];
  if (!Array.isArray(held)) return [];
  const carried: PastedComment[] = [];
  for (const comment of held as readonly Comment[]) {
    const start = positionOfElement(doc, comment.start.element, comment.start.offset);
    const end = positionOfElement(doc, comment.end.element, comment.end.offset);
    if (start === undefined || end === undefined) continue;
    const block = blocks.find(([from, to]) => start >= from && end <= to);
    if (block === undefined) continue;
    carried.push({
      id: comment.id,
      remark: comment.remark,
      start: start + block[2],
      end: end + block[2],
    });
  }
  return carried;
}

/* --------------------------------------------------------- typing the caret */

/**
 * Typing `^` at the end of a character cue pairs its speech with the one
 * above, when that is a valid pair, and the `^` is not put in the text: the
 * element carries it, and the paper never shows it. Anywhere else, or when
 * there is no valid pair, it is an ordinary character.
 *
 * Returns the transaction, or `undefined` when the key is not this rule's.
 * Spaces left between the name and the caret go too, since the file spells the
 * pair `NAME ^` with one.
 */
export function typedCaret(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | undefined {
  if (text !== "^" || from !== to) return undefined;
  const $at = state.doc.resolve(from);
  const cue = $at.parent;
  if (cue.type.name !== "element" || cue.attrs["type"] !== "character") return undefined;
  if ($at.parentOffset !== cue.content.size || cue.textContent.trim() === "") return undefined;

  // Already carries one: the `^` the writer meant is there, so typing another
  // would only write it twice into the file.
  if (cue.attrs["dual"] === true) return state.tr;

  const s = situation(state, from);
  if (planDual(s, [-1]) === undefined) return undefined;

  const tr = state.tr;
  const trailing = cue.textContent.length - cue.textContent.trimEnd().length;
  if (trailing > 0) tr.delete(from - trailing, from);
  tr.setNodeMarkup($at.before(), undefined, { ...cue.attrs, dual: true });
  tr.setSelection(TextSelection.create(tr.doc, from - trailing));
  return structural(tr);
}

/** The key, as a plugin. */
export const dualCaretKey = new Plugin({
  props: {
    handleTextInput: (view, from, to, text) => {
      const tr = typedCaret(view.state, from, to, text);
      if (tr === undefined) return false;
      if (tr.docChanged || tr.selectionSet) view.dispatch(tr);
      return true;
    },
  },
});
