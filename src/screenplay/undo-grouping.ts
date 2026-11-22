/**
 * Where one undo step ends and the next begins (#45, Noah's MVP notes).
 *
 * `prosemirror-history` groups by time alone: changes within a delay of each
 * other, next to each other, are one step. That made Ctrl+Z take back half a
 * word or three sentences depending on how fast the writer typed. A step here is
 * **a phrase**: a burst of typing is one step, and a new one begins at
 *
 * - **the end of a sentence**: typing after a `.`, `!`, `?` or `…` (and any
 *   closing quote or bracket after it) starts a new step, so the sentence and
 *   its full stop go back together;
 * - **a new line or a new element**: Enter, a split, a join, Tab — these are
 *   already steps of their own (`structural` in `element-keys.ts`), and a line
 *   break typed into the text is treated the same;
 * - **a pause** of `PAUSE_MS` or longer;
 * - **a caret moved elsewhere**: the next change is not where the last one
 *   ended, or is made over a selection;
 * - **typing turning into deleting**, or back;
 * - anything that is neither typing nor deleting (a paste, a mark, a change of
 *   structure), which is a step of its own.
 *
 * ## How
 *
 * A new step is begun by marking the transaction that begins it with
 * `closeHistory` before the history's own state reads it. This plugin's state
 * runs first because it comes before `history` in the plugin list
 * (`editorStateFor`), and a state's fields are applied in plugin order. That is
 * the one thing here that leans on ProseMirror's order of work, and the tests in
 * `test/editor/undo-grouping.test.ts` would fail if it changed.
 *
 * The cost per keystroke is a look at the transaction's own steps — never the
 * document — which `test/editor/keystroke-budget.test.ts` holds.
 */
import { closeHistory, isHistoryTransaction } from "prosemirror-history";
import type { Slice } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";

/** A pause in typing this long or longer begins a new undo step: about a second. */
export const PAUSE_MS = 1000;

/**
 * How many steps Undo can go back: 250, where `prosemirror-history` keeps 100
 * by default. A step is a phrase now, not half a second, so each is worth more.
 */
export const HISTORY_DEPTH = 250;

/** What a change did, as far as grouping cares. */
type Kind = "typing" | "deleting" | "other";

interface Grouping {
  /** What the last change kept in the history was; undefined when a step is closed. */
  readonly kind: Kind | undefined;
  /** Where that change left the caret, mapped through changes since. */
  readonly end: number | undefined;
  /** When it was made. */
  readonly time: number;
  /** It ended a sentence or a line: the next typing begins a new step. */
  readonly closed: boolean;
}

const CLOSED: Grouping = { kind: undefined, end: undefined, time: 0, closed: false };

/** Sentence-end punctuation, then any closing quotes or brackets after it. */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
/** Typing that only carries on a sentence's end: more stops, a closing quote. */
const STILL_ENDING = /^[.!?…"'”’)\]]+$/;

const key = new PluginKey<Grouping>("write-ist:undo-grouping");

/**
 * A step as far as this needs one. A replace step has a slice and no gap; a
 * mark or attribute step has no slice, and a structural "replace around" has a
 * gap. Read by shape because `prosemirror-transform` is not one of the
 * application's own dependencies.
 */
interface StepShape {
  readonly from?: number;
  readonly to?: number;
  readonly slice?: Slice;
  readonly gapFrom?: number;
}

/**
 * What a transaction did: typing (text in, perhaps over a selection),
 * deleting (text out, nothing in), or something else. Read from its steps,
 * which are one or two for a keystroke.
 */
function kindOf(transaction: Transaction): { readonly kind: Kind; readonly typed: string } {
  let typed = "";
  let inserted = false;
  let deleted = false;
  for (const step of transaction.steps) {
    const { slice, from = 0, to = 0, gapFrom } = step as StepShape;
    if (slice === undefined || gapFrom !== undefined) return { kind: "other", typed: "" };
    if (slice.size === 0) {
      if (to > from) deleted = true;
      continue;
    }
    // Typing puts text into one textblock; anything that opens or carries a
    // block (a split, a paste of lines) is not typing.
    if (slice.openStart !== 0 || slice.openEnd !== 0) return { kind: "other", typed: "" };
    let plain = true;
    slice.content.forEach((node) => {
      if (!node.isText) plain = false;
    });
    if (!plain) return { kind: "other", typed: "" };
    inserted = true;
    typed += slice.content.textBetween(0, slice.content.size);
  }
  if (inserted) return { kind: "typing", typed };
  return { kind: deleted ? "deleting" : "other", typed: "" };
}

/** A paste, a drop or a cut is a step of its own, whatever it put in. */
const fromClipboard = (transaction: Transaction): boolean => {
  const event = transaction.getMeta("uiEvent");
  return event === "paste" || event === "drop" || event === "cut";
};

/**
 * Begin a new undo step at each phrase. Put it **before** `history` in a
 * state's plugins.
 */
export const undoGrouping = new Plugin<Grouping>({
  key,
  state: {
    init: () => CLOSED,
    apply: (transaction, grouping, before, after) => {
      // Undo and redo close the step themselves; what comes after begins anew.
      if (isHistoryTransaction(transaction)) return CLOSED;
      if (!transaction.docChanged) return grouping;
      const time = transaction.time;
      // What the history does not keep, or what follows another change in the
      // same dispatch (it joins that change's step): only moved along.
      if (transaction.getMeta("addToHistory") === false || transaction.getMeta("appendedTransaction") !== undefined) {
        return grouping.end === undefined ? grouping : { ...grouping, end: transaction.mapping.map(grouping.end) };
      }

      const { kind, typed } = fromClipboard(transaction) ? { kind: "other" as const, typed: "" } : kindOf(transaction);
      const carriesOnEnding = grouping.closed && kind === "typing" && STILL_ENDING.test(typed);
      const begins =
        grouping.kind === undefined ||
        kind === "other" ||
        kind !== grouping.kind ||
        (grouping.closed && !carriesOnEnding) ||
        time - grouping.time >= PAUSE_MS ||
        !before.selection.empty ||
        before.selection.head !== grouping.end;
      // Marked before `history` reads it: this change is the first of a new step.
      if (begins) closeHistory(transaction);

      return {
        kind,
        end: after.selection.head,
        time,
        closed: kind === "other" || (kind === "typing" && (SENTENCE_END.test(typed) || typed.endsWith("\n"))) || carriesOnEnding,
      };
    },
  },
});

/** The grouping's state, for tests. */
export const undoGroupingOf = (state: EditorState): Grouping | undefined => key.getState(state);
