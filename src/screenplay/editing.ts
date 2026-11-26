/**
 * Editing the manuscript, with the comments kept true (#41).
 *
 * `src/screenplay/editor.ts` maps the model into the editor's document and
 * back. This file is what happens **between** those two — the state a writer
 * types into, and the one thing that does not take care of itself while they
 * do: the comments, which `./comment-editing.ts` keeps on their words.
 *
 * Until #41 nothing had to: `SETUP-CHECKLIST.md` records comment ends as
 * *"element indices, which nothing moves while nothing edits"*, and
 * `fromEditorDocument` throws rather than letting one land on the wrong words.
 * Typing is what makes them move, so typing is where they are moved — and the
 * failure this is written against is v1's, where a sidecar record quietly came
 * to describe the wrong text and the feature was abandoned rather than
 * debugged (ADR-0008).
 */
import type { Command, EditorState as State } from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { toggleMark } from "prosemirror-commands";
import { autocomplete, type AutocompleteOptions } from "./autocomplete.ts";
import type { Spellcheck } from "./spellcheck.ts";
import { clipboard } from "./clipboard.ts";
import { maintainComments } from "./comment-editing.ts";
import { dualCaretKey } from "./dual-dialogue.ts";
import { elementKeys, endsUndoStep, keepHiddenSyntax } from "./element-keys.ts";
import { HISTORY_DEPTH, PAUSE_MS, undoGrouping } from "./undo-grouping.ts";
import { maintainElements } from "./maintenance.ts";
import type { Node as EditorNode } from "prosemirror-model";
import type { Comment, CommentEnd } from "../comments.ts";
import type { Element, ScreenplayDocument } from "./document.ts";
import { fromEditorDocument, toEditorDocument } from "./editor.ts";
import { keepTitlePageOut, startOfScript } from "./title-page-editing.ts";
import { outsidePageBreak, pageBreaksFollowText } from "./page-break-editing.ts";
import { screenplaySchema } from "./schema.ts";

/**
 * Undo and redo (#45): a stack over the editor's transactions that lives in the
 * state, so it dies with the session and is never saved (ADR-0019). A step is a
 * phrase: a burst of typing, ended by a sentence's end, a new line or element,
 * a pause, a caret moved elsewhere, or typing turning into deleting
 * (`./undo-grouping.ts`, which decides, and runs before this). It keeps
 * `HISTORY_DEPTH` steps.
 */
const undoStack = history({ depth: HISTORY_DEPTH, newGroupDelay: PAUSE_MS });

/** The undo keys, bound to `prosemirror-history`'s commands unless the window brings its own. */
const undoKeys = (commands: UndoCommands = { undo, redo }) =>
  keymap({
    "Mod-z": commands.undo,
    "Mod-Shift-z": commands.redo,
    "Mod-y": commands.redo,
  });

/** What Undo and Redo run. */
export interface UndoCommands {
  readonly undo: Command;
  readonly redo: Command;
}

/**
 * Bold, italic and underline from the keyboard (#46).
 *
 * `toggleMark` takes the mark off when the whole selection already carries it
 * and puts it on otherwise; at a caret it sets the marks the next typed text
 * takes. A selection across elements marks the covered slice of each, and
 * because a mark lives on each element's own text (ADR-0027) the serialiser
 * writes each its own delimiter pair. Nesting on the way out is the
 * serialiser's, by `EMISSION_ORDER`, not the order the keys were pressed in.
 */
export const markKeys = keymap({
  "Mod-b": toggleMark(screenplaySchema.marks["bold"]!),
  "Mod-i": toggleMark(screenplaySchema.marks["italic"]!),
  "Mod-u": toggleMark(screenplaySchema.marks["underline"]!),
});

/** What the window adds to the state the editing tests share. */
export interface EditorOptions {
  /** Offer to finish cues and headings from the name lists (step 9). */
  readonly autocomplete?: AutocompleteOptions;
  /** Underline misspelt words while a pass is on (step 10). Off until toggled. */
  readonly spellcheck?: Spellcheck;
  /**
   * Undo and redo that also take back steps off the paper, such as Add to
   * Dictionary (`./off-paper-undo.ts`). Default: the text history alone.
   */
  readonly undo?: UndoCommands;
}

/**
 * The state a writer types into.
 *
 * One place builds it, so the editing tests and the window are running the
 * same editor. Everything about *what* the document is stays in
 * `toEditorDocument`; this adds only what has to survive being typed in.
 */
export function editorStateFor(document: ScreenplayDocument, options: EditorOptions = {}): State {
  const doc = toEditorDocument(withALineToTypeOn(document));
  // Autocomplete (step 9) is ahead of the plugin that binds Enter and Tab, so
  // that with an offer showing those keys are the offer's.
  const offers = options.autocomplete === undefined ? [] : [autocomplete(options.autocomplete)];
  const spelling = options.spellcheck === undefined ? [] : [options.spellcheck.plugin];
  return EditorState.create({
    schema: screenplaySchema,
    doc,
    // The title page is not on the paper: the caret starts in the script.
    selection: outsidePageBreak(doc, startOfScript(doc)),
    // `maintainElements` comes before `endsUndoStep` so that what it appends to a
    // structural change joins that change's undo step rather than following it.
    // `undoGrouping` before `undoStack`: it marks where a new step begins
    // before the history reads the transaction.
    plugins: [undoGrouping, undoStack, undoKeys(options.undo), markKeys, clipboard, dualCaretKey, ...offers, elementKeys, keepHiddenSyntax, maintainElements, endsUndoStep, maintainComments, keepTitlePageOut, pageBreaksFollowText, ...spelling],
  });
}

/**
 * A manuscript with no elements — a new project holds only its title page — has
 * nowhere to put a caret but the title. So the editor is given one blank line,
 * which is how a writer's blank line always is: spacing, not an element, and
 * `manuscriptOf` drops it again unless something was typed on it.
 */
function withALineToTypeOn(document: ScreenplayDocument): ScreenplayDocument {
  if (document.elements.length > 0) return document;
  return { ...document, elements: [{ type: "action", text: "", forced: false }] };
}

/* ----------------------------------------------- the manuscript, as the file has it */

/**
 * The manuscript the editor's document says — **the model, and the only thing
 * the serialiser is ever given** (#37, #41).
 *
 * It is `fromEditorDocument` plus one rule, and the rule is ADR-0019's:
 * *blank lines are not stored*. An element with no text in it is a blank line,
 * and a blank line is spacing rather than an element — where one falls on the
 * way out is a lookup on the pair of types either side of it.
 *
 * ## Why this is not tidiness
 *
 * Deleting every character of an element is ordinary editing and this ticket's
 * first acceptance criterion; so is selecting across two elements and deleting
 * the selection, which joins them and can leave the survivor empty. Either way
 * the writer is left standing on a blank line, which is exactly right on
 * screen and cannot be written to the file — an empty element serialises as an
 * extra blank line, and reading that file back does not produce it again.
 *
 * That would break the promise the whole document model is built on:
 * *"Thereafter the file is ours. Opening it and saving it without typing
 * produces a byte-identical file on disk, forever"* (ADR-0020 point 2). A
 * manuscript Write-ist wrote that does not round-trip is the one failure this
 * project's gate exists to catch, so the blank line is kept out of the file
 * rather than written and then quietly absorbed.
 *
 * **Nothing the writer typed is ever dropped by this.** Every element type
 * that looks structural carries its own text — a page break is `====`, and a
 * boneyard's two delimiters are elements carrying theirs — measured across all
 * four screenplay manuscripts, which hold no element with empty text between
 * them.
 * `test/editor/typing.test.ts` pins that.
 *
 * `fromEditorDocument` stays the exact inverse of `toEditorDocument`, which is
 * what #39's round-trip gate asserts. This is the layer above it, and the two
 * agree on every manuscript that came off a disk.
 */
export function manuscriptOf(doc: EditorNode): ScreenplayDocument {
  return withoutBlankLines(fromEditorDocument(doc));
}

function withoutBlankLines(document: ScreenplayDocument): ScreenplayDocument {
  const elements: Element[] = [];
  /** Old element index → new index, or undefined where a blank line was. */
  const moved: (number | undefined)[] = [];
  for (const element of document.elements) {
    if (element.text === "") {
      moved.push(undefined);
      continue;
    }
    moved.push(elements.length);
    elements.push(element);
  }
  if (elements.length === document.elements.length) return document;

  // A comment end sitting *in* a blank line has no characters to point at, so
  // it belongs at the near edge of the nearest line that has some: a start
  // moves forward onto the next, an end moves back onto the last. Dropping it
  // instead would lose a remark whose text is still there (ADR-0008 rule 4).
  const relocate = (end: CommentEnd, towards: 1 | -1): CommentEnd | undefined => {
    for (let at = end.element; at >= 0 && at < moved.length; at += towards) {
      const to = moved[at];
      if (to === undefined) continue;
      if (at === end.element) return { element: to, offset: end.offset };
      return { element: to, offset: towards === 1 ? 0 : elements[to]!.text.length };
    }
    return undefined;
  };

  const comments: Comment[] = [];
  for (const comment of document.comments) {
    const start = relocate(comment.start, 1);
    const end = relocate(comment.end, -1);
    if (start === undefined || end === undefined) continue;
    comments.push({ ...comment, start, end });
  }

  return { ...document, elements, comments };
}
