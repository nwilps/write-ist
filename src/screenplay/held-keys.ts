/**
 * The keys #43 owns, held until it owns them.
 *
 * **This whole file is temporary, which is why it is a file.** #41 turns typing
 * on within an element; Enter, Tab, and splitting and joining lines are #43.
 * Between the two there is a gap that has to be closed rather than left open:
 * with no handler at all these keys fall through to the browser, which happily
 * splits a `div` in the page — and what the editing engine then reads back off
 * that is a second element with no type, which is not a screenplay.
 *
 * So they do nothing, visibly and deliberately, rather than doing something
 * nobody chose. A key that is inert is a missing feature; a key that invents an
 * element is a corrupted manuscript, and `docs/STANDARDS.md` is about which
 * failures are allowed to be quiet.
 *
 * **Deleting a selection that covers several elements is not held**, because it
 * needs nothing invented: the elements it covers go, the one left keeps its own
 * type — which is the rule #43 gives Backspace — and the comments over them are
 * mapped like any other edit.
 *
 * #43 deletes this file.
 */
import { keymap } from "prosemirror-keymap";
import { TextSelection, type Command, type EditorState } from "prosemirror-state";

/** Enter would split an element into two, and only #43 knows what the second is. */
export const holdSplit: Command = () => true;

/** Backspace at the very start of an element would join it onto the one above. */
export const holdJoinBackwards: Command = (state) => atEdge(state, "start");

/** Delete at the very end of an element would pull the one below onto it. */
export const holdJoinForwards: Command = (state) => atEdge(state, "end");

/**
 * Whether the caret is sitting on an element's boundary with nothing selected
 * — the one position at which a delete key stops removing a character and
 * starts removing a line.
 */
function atEdge(state: EditorState, which: "start" | "end"): boolean {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const at = selection.$head;
  if (at.parent.type.name !== "element") return false;
  return which === "start" ? at.parentOffset === 0 : at.parentOffset === at.parent.content.size;
}

/** The keys held, as one plugin, so there is one line to delete as well as one file. */
export const heldKeys = keymap({
  Enter: holdSplit,
  "Shift-Enter": holdSplit,
  "Mod-Enter": holdSplit,
  Backspace: holdJoinBackwards,
  "Mod-Backspace": holdJoinBackwards,
  Delete: holdJoinForwards,
  "Mod-Delete": holdJoinForwards,
});
