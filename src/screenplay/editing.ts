/**
 * Editing the manuscript, with the comments kept true (#41).
 *
 * `src/screenplay/editor.ts` maps the model into the editor's document and
 * back. This file is what happens **between** those two — the state a writer
 * types into, and the one thing that does not take care of itself while they
 * do.
 *
 * ## Why a comment needs looking after and a mark does not
 *
 * A mark is stored inside the element it covers (ADR-0027), so ProseMirror
 * carries it: the element is a textblock, the mark is on its text, and an
 * insertion in the middle of a marked run widens the run without anybody
 * asking. A **comment** is different, and ADR-0018 is why: it may open in one
 * element and close in another, it has exactly one remark, so it is held once
 * **on the document** as a pair of `{ element, offset }` ends. Nothing in
 * ProseMirror knows those numbers mean anything, so nothing in ProseMirror
 * moves them.
 *
 * Until this ticket nothing had to: `SETUP-CHECKLIST.md` records comment ends
 * as *"element indices, which nothing moves while nothing edits"*, and
 * `fromEditorDocument` throws rather than letting one land on the wrong words.
 * Typing is what makes them move, so typing is where they are moved — and the
 * failure this is written against is v1's, where a sidecar record quietly came
 * to describe the wrong text and the feature was abandoned rather than
 * debugged (ADR-0008).
 *
 * ## Positions, not indices, while the project is open
 *
 * The plugin holds each end as a **document position**, because that is the
 * one form ProseMirror will map for us: every transaction carries a mapping
 * from the positions before it to the positions after it, and mapping `c`
 * comments costs `c` — it does not walk the manuscript.
 *
 * That is not a micro-optimisation, it is the rule ADR-0019's last consequence
 * and `docs/STANDARDS.md`'s *Measure the measurer* both state: derived data is
 * computed incrementally and **never for the whole document on every
 * keystroke**. The element-and-offset form the model and the serialiser want
 * is rebuilt from those positions after each change, which costs `c` resolves
 * and no scan.
 *
 * ## Which side of a boundary typed text lands on
 *
 * A comment's start maps forward and its end maps backward, so text typed
 * exactly at either boundary lands **outside** the comment and the remark goes
 * on covering the words it was left on.
 *
 * The same two biases give ADR-0018's deletion rule for free: delete every
 * character a comment covers and its two ends arrive at the same position, so
 * the comment is empty, and an empty comment is dropped rather than left
 * pointing at a seam. *"Deleting all the text a comment covers removes the
 * comment with it."*
 */
import { Plugin, PluginKey, type EditorState as State } from "prosemirror-state";
import { EditorState } from "prosemirror-state";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { toggleMark } from "prosemirror-commands";
import { clipboard, pastedComments } from "./clipboard.ts";
import { elementKeys, endsUndoStep } from "./element-keys.ts";
import { maintainElements } from "./maintenance.ts";
import type { Node as EditorNode } from "prosemirror-model";
import type { Comment, CommentEnd } from "../comments.ts";
import type { Element, ScreenplayDocument } from "./document.ts";
import { fromEditorDocument, toEditorDocument } from "./editor.ts";
import { screenplaySchema } from "./schema.ts";

/**
 * A comment while the project is open: its remark, and its two ends as
 * document positions.
 *
 * The positions are the working form and die with the session, exactly like
 * element identity (ADR-0019). Nothing here is ever written to a file — the
 * serialiser reads the `{ element, offset }` ends off the document.
 */
interface PlacedComment {
  readonly id: string;
  readonly remark: string;
  readonly start: number;
  readonly end: number;
}

const placedComments = new PluginKey<readonly PlacedComment[]>("write-ist:comments");

/**
 * Keep every comment on the words it was left on, through every edit
 * (ADR-0018).
 *
 * The plugin's own state is the positions; the document's `comments` attribute
 * is rebuilt from them after any change, so everything downstream — the model,
 * the serialiser, the round-trip gate — keeps reading comments in exactly the
 * form it already read them in.
 */
export const maintainComments = new Plugin<readonly PlacedComment[]>({
  key: placedComments,
  state: {
    init: (_config, state) => placeComments(state.doc),
    apply: (transaction, placed) => {
      if (!transaction.docChanged) return placed;
      const moved: PlacedComment[] = [];
      for (const comment of placed) {
        // Start forward, end backward: typed text at either boundary lands
        // outside the comment, and a deleted span collapses the two onto each
        // other.
        const start = transaction.mapping.map(comment.start, 1);
        const end = transaction.mapping.map(comment.end, -1);
        // Every character it covered is gone, so the remark is about nothing.
        if (end <= start) continue;
        moved.push({ ...comment, start, end });
      }
      // A paste brings its comments already placed in the new document (#47);
      // they join in the order they open.
      const pasted = transaction.getMeta(pastedComments) as readonly PlacedComment[] | undefined;
      if (pasted === undefined) return moved;
      return [...moved, ...pasted].sort((a, b) => a.start - b.start);
    },
  },
  appendTransaction: (transactions, _old, state) => {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;

    const placed = placedComments.getState(state) ?? [];
    const rebuilt = commentsFrom(state.doc, placed);
    const held = state.doc.attrs["comments"];
    if (Array.isArray(held) && same(held as readonly Comment[], rebuilt)) return null;
    return state.tr.setDocAttribute("comments", rebuilt);
  },
});

/**
 * Undo and redo (#45): a stack over the editor's transactions that lives in the
 * state, so it dies with the session and is never saved (ADR-0019). Typing
 * within half a second, in one place, is one step; a structural change
 * (`./element-keys.ts`) or a longer pause begins another.
 */
const undoStack = history({ newGroupDelay: 500 });

const undoKeys = keymap({
  "Mod-z": undo,
  "Mod-Shift-z": redo,
  "Mod-y": redo,
});

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

/**
 * The state a writer types into.
 *
 * One place builds it, so the editing tests and the window are running the
 * same editor. Everything about *what* the document is stays in
 * `toEditorDocument`; this adds only what has to survive being typed in.
 */
export function editorStateFor(document: ScreenplayDocument): State {
  return EditorState.create({
    schema: screenplaySchema,
    doc: toEditorDocument(document),
    // `maintainElements` comes before `endsUndoStep` so that what it appends to a
    // structural change joins that change's undo step rather than following it.
    plugins: [undoStack, undoKeys, markKeys, clipboard, elementKeys, maintainElements, endsUndoStep, maintainComments],
  });
}

/* ------------------------------------------------------- ends ↔ positions */

/**
 * Each comment's two ends as document positions, read off the document once
 * when the project opens.
 *
 * This is the one pass over the manuscript, and it is at load rather than per
 * keystroke: from here on the positions are mapped.
 */
function placeComments(doc: EditorNode): readonly PlacedComment[] {
  const held = doc.attrs["comments"];
  if (!Array.isArray(held) || held.length === 0) return [];
  const comments = held as readonly Comment[];

  // Where each element's text starts, by element index. `title_line* element*`
  // (`src/screenplay/schema.ts`), so the elements are the tail of the
  // document's children.
  const starts: number[] = [];
  let at = 0;
  doc.forEach((child) => {
    if (child.type.name === "element") starts.push(at + 1);
    at += child.nodeSize;
  });

  const placed: PlacedComment[] = [];
  for (const comment of comments) {
    const start = positionOf(doc, starts, comment.start);
    const end = positionOf(doc, starts, comment.end);
    // Loud rather than silently dropped (ADR-0008 rule 4). `fromEditorDocument`
    // makes the same check for the same reason; a comment whose end is not a
    // place in the manuscript is a bug upstream, not a comment to discard.
    if (start === undefined || end === undefined) {
      throw new Error(
        `comment ${comment.id} is anchored outside a manuscript of ${starts.length} elements`,
      );
    }
    placed.push({ id: comment.id, remark: comment.remark, start, end });
  }
  return placed;
}

function positionOf(
  doc: EditorNode,
  starts: readonly number[],
  end: CommentEnd,
): number | undefined {
  const start = starts[end.element];
  if (start === undefined) return undefined;
  const element = doc.nodeAt(start - 1);
  if (element === undefined || element === null || end.offset > element.content.size) {
    return undefined;
  }
  return start + end.offset;
}

/** The comments as the model holds them, rebuilt from the positions. */
function commentsFrom(doc: EditorNode, placed: readonly PlacedComment[]): readonly Comment[] {
  if (placed.length === 0) return [];
  const titleLines = titleLineCount(doc);

  const comments: Comment[] = [];
  for (const comment of placed) {
    const start = endAt(doc, comment.start, titleLines);
    const end = endAt(doc, comment.end, titleLines);
    // Both ends were mapped out of every element there is — the manuscript no
    // longer holds the words the remark was about.
    if (start === undefined || end === undefined) continue;
    comments.push({ id: comment.id, remark: comment.remark, start, end });
  }
  return comments;
}

/**
 * One position as an element and an offset.
 *
 * `resolve` walks the document's depth rather than its length, so this costs
 * the same on a hundred elements and on three thousand.
 */
function endAt(doc: EditorNode, position: number, titleLines: number): CommentEnd | undefined {
  const at = doc.resolve(position);
  if (at.depth !== 1 || at.parent.type.name !== "element") return undefined;
  return { element: at.index(0) - titleLines, offset: at.parentOffset };
}

/** How many title-page lines the document opens with. They come first. */
function titleLineCount(doc: EditorNode): number {
  let lines = 0;
  while (lines < doc.childCount && doc.child(lines).type.name === "title_line") lines++;
  return lines;
}

function same(held: readonly Comment[], rebuilt: readonly Comment[]): boolean {
  if (held.length !== rebuilt.length) return false;
  return held.every((comment, index) => {
    const other = rebuilt[index]!;
    return (
      comment.id === other.id &&
      comment.start.element === other.start.element &&
      comment.start.offset === other.start.offset &&
      comment.end.element === other.end.element &&
      comment.end.offset === other.end.offset
    );
  });
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
