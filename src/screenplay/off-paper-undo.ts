/**
 * Undo steps that change nothing on the paper (Add to Dictionary, #140).
 *
 * Undo and redo walk one history, in the order the writer did things. Most of
 * it is `prosemirror-history`'s, which only knows edits to the document; an
 * off-paper step — a word put in the dictionary, a name put on a list — changes
 * files beside the manuscript and no text. Putting such a step into
 * ProseMirror's history would need a change to the document, and that would
 * mark the screenplay unsaved for nothing, so the steps are held here instead,
 * each against **how many text steps came before it** (`undoDepth`).
 *
 * The `undo` and `redo` here are the commands Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y and
 * the Edit menu run. Each takes the most recent thing back: an off-paper step
 * if it came after every text step still on the stack, else the text step.
 *
 * Recording a step closes the current typing group, so typing on either side of
 * it stays two steps with it in between.
 */
import {
  closeHistory,
  isHistoryTransaction,
  redo as redoText,
  redoDepth,
  undo as undoText,
  undoDepth,
} from "prosemirror-history";
import type { Command, EditorState, Transaction } from "prosemirror-state";

/** Something the writer did that one undo takes back and one redo puts back. */
export interface OffPaperStep {
  readonly undo: () => void;
  readonly redo: () => void;
}

interface Held {
  /** Text steps on the stack this one sits above: the undo depth, or the redo depth once undone. */
  depth: number;
  readonly step: OffPaperStep;
}

export class OffPaperHistory {
  private done: Held[] = [];
  private undone: Held[] = [];

  /**
   * A step is about to happen: answers the transaction that closes the typing
   * group (dispatch it) and the call that records the step once it is known.
   * The two are apart because what the step changed is only known after the
   * dictionary has answered; a step that changed nothing is never recorded.
   */
  begin(state: EditorState): { readonly close: Transaction; readonly record: (step: OffPaperStep) => void } {
    const depth = undoDepth(state);
    return {
      close: closeHistory(state.tr).setMeta("addToHistory", false),
      record: (step) => {
        // A new action: what was undone cannot be redone (as with typing).
        this.undone = [];
        // Kept in order of depth, should anything have been typed meanwhile.
        let at = this.done.length;
        while (at > 0 && this.done[at - 1]!.depth > depth) at -= 1;
        this.done.splice(at, 0, { depth, step });
      },
    };
  }

  /**
   * Every transaction the editor applied, with the states either side, so the
   * held steps stay in step with the text history.
   */
  applied(transaction: Transaction, before: EditorState, after: EditorState): void {
    if (isHistoryTransaction(transaction) || transaction.getMeta("addToHistory") === false) return;
    if (transaction.docChanged) this.undone = [];
    // The text history keeps `HISTORY_DEPTH` steps, and some over, and drops
    // the oldest at once when it outgrows that. Dropping only happens as a step is added, so the
    // number dropped is one more than the depth fell by.
    const was = undoDepth(before);
    const now = undoDepth(after);
    if (now < was) {
      const dropped = was + 1 - now;
      this.done = this.done
        .map((held) => ({ depth: held.depth - dropped, step: held.step }))
        .filter((held) => held.depth >= 0);
    }
  }

  /** The text was replaced wholesale (a reload): nothing before it can be undone. */
  clear(): void {
    this.done = [];
    this.undone = [];
  }

  readonly undo: Command = (state, dispatch, view) => {
    const last = this.done[this.done.length - 1];
    if (last === undefined || last.depth < undoDepth(state)) return undoText(state, dispatch, view);
    if (dispatch !== undefined) {
      this.done.pop();
      this.undone.push({ depth: redoDepth(state), step: last.step });
      last.step.undo();
    }
    return true;
  };

  readonly redo: Command = (state, dispatch, view) => {
    const last = this.undone[this.undone.length - 1];
    if (last === undefined || last.depth < redoDepth(state)) return redoText(state, dispatch, view);
    if (dispatch !== undefined) {
      this.undone.pop();
      this.done.push({ depth: undoDepth(state), step: last.step });
      last.step.redo();
    }
    return true;
  };
}
