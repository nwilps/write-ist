/**
 * Comments while the project is open (ADR-0018): kept on their words through
 * every edit, made, written in, resolved, and lit.
 *
 * `editing.ts` builds the state a writer types into; this is the part of it
 * that looks after comments, and the commands the Editor's cards, its button,
 * its key and its right-click menu run. Everything here is a function of an
 * `EditorState`, so the tests need no window.
 *
 * ## Why a comment needs looking after and a mark does not
 *
 * A mark is stored inside the element it covers (ADR-0027), so ProseMirror
 * carries it. A **comment** may open in one element and close in another and
 * has one remark, so it is held once **on the document** as a pair of
 * `{ element, offset }` ends (ADR-0018). Nothing in ProseMirror knows those
 * numbers mean anything, so nothing in ProseMirror moves them: this does.
 *
 * ## Positions, not indices, while the project is open
 *
 * The plugin holds each end as a **document position**, because that is the
 * one form ProseMirror will map: mapping `c` comments costs `c` and does not
 * walk the manuscript (ADR-0019's last consequence, *Measure the measurer*).
 * The element-and-offset form the model and the serialiser read is rebuilt
 * from them after each change.
 *
 * ## Which side of a boundary typed text lands on
 *
 * A start maps forward and an end backward, so text typed at either boundary
 * lands **outside** the comment. Delete every character a comment covers and
 * its ends meet, and the comment goes with them: *"Deleting all the text a
 * comment covers removes the comment with it."*
 *
 * ## The document's list is the record, and Undo writes it
 *
 * Making, rewording and resolving a comment each change the document's
 * `comments` attribute and nothing else, as one step of their own, so the
 * history keeps them like any edit. **Undo writes that attribute back**, and
 * whenever a step the plugin did not make itself changes it, the positions are
 * read off it again. That is what brings a resolved comment back on Ctrl+Z —
 * and one whose words were deleted and then restored, which mapping alone
 * could never do, since a collapsed range has nothing left to map.
 *
 * ## A new comment is a draft until it says something
 *
 * Add Comment opens an empty card for the writer to type in. Until they leave
 * it, the comment is a **draft**: lit on the paper and drawn as a card, and
 * not in the document, so it is not saved, not copied and not in the history.
 * Leaving the card with words in it makes the comment, as one step; leaving
 * it empty makes nothing, and there is nothing to undo (Noah, 2026-11-25).
 *
 * ## Which comment is lit
 *
 * One at a time, or none: the card the writer is in, or else the innermost
 * comment round the caret. Clicking highlighted words is putting the caret in
 * them, so that lights their comment too.
 */
import { Plugin, PluginKey, type EditorState, type Transaction } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as EditorNode } from "prosemirror-model";
import { SCREENPLAY_COMMENTS, type Comment } from "../comments.ts";
import { pastedComments } from "./clipboard.ts";
import type { ElementType } from "./document.ts";
import { elementAt, paperIndex, positionOfElement } from "./numbering.ts";

/**
 * A comment while the project is open: its remark, and its two ends as
 * document positions. The positions die with the session, exactly like
 * element identity (ADR-0019); the file is written from the ends on the
 * document.
 */
export interface PlacedComment {
  readonly id: string;
  readonly remark: string;
  readonly start: number;
  readonly end: number;
}

/** A comment as the Editor draws it: a card and the words it is about. */
export interface ShownComment extends PlacedComment {
  /** Lit: its card at full strength, its words more strongly tinted. */
  readonly active: boolean;
  /** Not in the document yet: an empty card the writer has just opened. */
  readonly draft: boolean;
}

/** The draft's id while it is one. Never a comment's: an id has a character at least. */
export const DRAFT_ID = "";

interface Held {
  readonly placed: readonly PlacedComment[];
  readonly draft: { readonly start: number; readonly end: number } | undefined;
  /** The lit comment's id, `DRAFT_ID` for the draft, or nothing. */
  readonly active: string | undefined;
  readonly highlights: DecorationSet;
}

/** What a command asks of the plugin, beside any change to the document. */
type Asked =
  | { readonly draft: { readonly start: number; readonly end: number } }
  | { readonly dropDraft: true; readonly active?: string }
  | { readonly active: string | undefined };

const key = new PluginKey<Held>("write-ist:comments");

/** Meta on the plugin's own bringing-up-to-date of the list, which needs no reading back. */
const synced = new PluginKey<true>("write-ist:comments-synced");

/**
 * Keep every comment on the words it was left on (ADR-0018), hold the draft
 * and which comment is lit, and tint the words each is about.
 */
export const maintainComments = new Plugin<Held>({
  key,
  state: {
    init: (_config, state) => {
      const placed = placeComments(state.doc);
      return { placed, draft: undefined, active: undefined, highlights: highlightsOf(state.doc, placed, undefined, undefined) };
    },
    apply: (transaction, held, _before, after) => {
      const asked = transaction.getMeta(key) as Asked | undefined;
      let { placed, draft, active } = held;
      let redraw = false;

      if (transaction.docChanged) {
        const pasted = transaction.getMeta(pastedComments) as readonly PlacedComment[] | undefined;
        if (rewritesList(transaction) && transaction.getMeta(synced) === undefined) {
          // Undo, Redo, or one of the commands below: the list is the record.
          placed = placeComments(after.doc);
          redraw = true;
        } else {
          placed = mapped(placed, transaction);
          if (placed.length !== held.placed.length) redraw = true;
          // A paste brings its comments already placed in the new document
          // (#47); they join in the order they open.
          if (pasted !== undefined) {
            placed = [...placed, ...pasted].sort((a, b) => a.start - b.start);
            redraw = true;
          }
        }
        if (draft !== undefined) {
          const start = transaction.mapping.map(draft.start, 1);
          const end = transaction.mapping.map(draft.end, -1);
          draft = end > start ? { start, end } : undefined;
        }
      }

      if (asked !== undefined && "draft" in asked) {
        draft = asked.draft;
        active = DRAFT_ID;
      } else if (asked !== undefined && "dropDraft" in asked) {
        draft = undefined;
        active = asked.active;
      } else if (asked !== undefined) {
        active = asked.active;
      } else if (transaction.selectionSet && draft === undefined) {
        active = innermostAt(placed, after.selection.head);
      }
      // A lit comment that has gone (resolved, or its words deleted) is lit no more.
      if (active === DRAFT_ID ? draft === undefined : active !== undefined && !placed.some((c) => c.id === active)) {
        active = undefined;
      }
      // A command, another comment lit, or the draft gone: tinted afresh.
      // Otherwise the tints are only moved along with the text.
      if (asked !== undefined || active !== held.active || (draft === undefined && held.draft !== undefined)) redraw = true;

      const highlights = redraw
        ? highlightsOf(after.doc, placed, draft, active)
        : transaction.docChanged
          ? held.highlights.map(transaction.mapping, after.doc)
          : held.highlights;
      if (placed === held.placed && draft === held.draft && active === held.active && highlights === held.highlights) return held;
      return { placed, draft, active, highlights };
    },
  },
  props: {
    decorations: (state) => key.getState(state)?.highlights,
  },
  appendTransaction: (transactions, _old, state) => {
    if (!transactions.some((transaction) => transaction.docChanged)) return null;

    const placed = key.getState(state)?.placed ?? [];
    const rebuilt = commentsFrom(state.doc, placed);
    const held = state.doc.attrs["comments"];
    if (Array.isArray(held) && same(held as readonly Comment[], rebuilt)) return null;
    return state.tr.setDocAttribute("comments", rebuilt).setMeta(synced, true);
  },
});

/* ------------------------------------------------------------- what to draw */

/** The comments to draw, the draft among them, in the order they open. */
export function shownComments(state: EditorState): readonly ShownComment[] {
  const held = key.getState(state);
  if (held === undefined) return [];
  const shown: ShownComment[] = held.placed.map((comment) => ({ ...comment, active: comment.id === held.active, draft: false }));
  if (held.draft !== undefined) {
    shown.push({ id: DRAFT_ID, remark: "", ...held.draft, active: held.active === DRAFT_ID, draft: true });
  }
  return shown.sort((a, b) => a.start - b.start);
}

/** The lit comment's id, `DRAFT_ID` for the draft, or nothing. */
export function activeComment(state: EditorState): string | undefined {
  return key.getState(state)?.active;
}

/* ----------------------------------------------------------------- commands */

/**
 * What a new comment covers (ADR-0018): the selection, or with only a caret
 * the line it is on — the whole element unless the writer broke it with a
 * new line. No sentence detection. Nothing on a blank line, on a page break's
 * `===` or a boneyard's delimiter, or off the paper.
 */
export function commentRange(
  state: EditorState,
  pointed?: number,
): { readonly start: number; readonly end: number } | undefined {
  const { from, to, empty } = state.selection;
  // Where the writer pointed (a right-click): the selection if it is inside
  // it, as the menu leaves the selection then, and the line there if not.
  const inSelection = !empty && (pointed === undefined || (pointed >= from && pointed <= to));
  if (inSelection) return withinElements(state.doc, from, to);
  const $head = pointed === undefined ? state.selection.$head : state.doc.resolve(pointed);

  if ($head.parent.type.name !== "element") return undefined;
  // A forced page break's `===` and the boneyard's two delimiters are syntax
  // the writer sees, not words the writer wrote.
  if (SYNTAX_LINES.has($head.parent.attrs["type"] as ElementType)) return undefined;
  const text = $head.parent.textContent;
  const at = $head.parentOffset;
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const newline = text.indexOf("\n", at);
  const lineEnd = newline === -1 ? text.length : newline;
  if (lineEnd <= lineStart) return undefined;
  const base = $head.start();
  return { start: base + lineStart, end: base + lineEnd };
}

/** Lines with nothing on them to comment on, alone. */
const SYNTAX_LINES: ReadonlySet<ElementType> = new Set(["page-break", "boneyard-start", "boneyard-end"]);

/** Open an empty card over the selection, or the caret's line: the draft. `null` where there is nothing to cover. */
export function startComment(state: EditorState): Transaction | null {
  const range = commentRange(state);
  if (range === undefined) return null;
  const asked: Asked = { draft: range };
  return state.tr.setMeta(key, asked);
}

/**
 * The writer left the draft's card. With words in it, the comment is made,
 * one undo step, and stays lit. Empty, it quietly goes: nothing is made, and
 * nothing goes into the history.
 */
export function finishDraft(
  state: EditorState,
  typed: string,
  mintId: (state: EditorState) => string = nextCommentId,
): Transaction | null {
  const draft = key.getState(state)?.draft;
  if (draft === undefined) return null;
  const remark = SCREENPLAY_COMMENTS.fitRemark(typed);
  if (remark === "") {
    const dropped: Asked = { dropDraft: true };
    return state.tr.setMeta(key, dropped);
  }
  const start = elementAt(state.doc, draft.start);
  const end = elementAt(state.doc, draft.end);
  if (start === undefined || end === undefined) return null;
  const id = mintId(state);
  const made: Comment = {
    id,
    remark,
    start: { element: start.element, offset: start.offset },
    end: { element: end.element, offset: end.offset },
  };
  // In the order they open, as a file read from disk lists them.
  const list = [...held(state.doc), made].sort(
    (a, b) => a.start.element - b.start.element || a.start.offset - b.start.offset,
  );
  const asked: Asked = { dropDraft: true, active: id };
  return state.tr.setDocAttribute("comments", list).setMeta(key, asked);
}

/** Put the writer's new words in a comment's card into its remark: one undo step. `null` if they are the same. */
export function setRemark(state: EditorState, id: string, typed: string): Transaction | null {
  const remark = SCREENPLAY_COMMENTS.fitRemark(typed);
  const list = held(state.doc);
  const at = list.findIndex((comment) => comment.id === id);
  if (at < 0 || list[at]!.remark === remark) return null;
  const next = list.map((comment, index) => (index === at ? { ...comment, remark } : comment));
  return state.tr.setDocAttribute("comments", next);
}

/**
 * Resolve: the comment is deleted and the words it was about stay, exactly as
 * they were (Noah, 2026-11-25). One undo step, so Ctrl+Z brings it back; no
 * question asked first. The draft is simply let go.
 */
export function resolveComment(state: EditorState, id: string): Transaction | null {
  if (id === DRAFT_ID) {
    if (key.getState(state)?.draft === undefined) return null;
    const dropped: Asked = { dropDraft: true };
    return state.tr.setMeta(key, dropped);
  }
  const list = held(state.doc);
  if (!list.some((comment) => comment.id === id)) return null;
  return state.tr.setDocAttribute(
    "comments",
    list.filter((comment) => comment.id !== id),
  );
}

/** Light one comment, from its card, or none. Not an edit: nothing is saved or undone. */
export function activateComment(state: EditorState, id: string | undefined): Transaction {
  const asked: Asked = { active: id };
  return state.tr.setMeta(key, asked);
}

/**
 * The next id: one more than the highest number among them, so a new comment
 * reads `[[c:3 remark]]` in the file. Pasted comments keep theirs unless they
 * collide (`clipboard.ts`).
 */
export function nextCommentId(state: EditorState): string {
  let highest = 0;
  for (const comment of held(state.doc)) {
    if (/^\d+$/.test(comment.id)) highest = Math.max(highest, Number(comment.id));
  }
  return String(highest + 1);
}

/* ------------------------------------------------------------------ helpers */

function held(doc: EditorNode): readonly Comment[] {
  const list = doc.attrs["comments"];
  return Array.isArray(list) ? (list as readonly Comment[]) : [];
}

/**
 * Whether a transaction sets the document's comments. Read by shape, as
 * `undo-grouping.ts` reads steps: `prosemirror-transform` is not one of the
 * application's own dependencies. A document attribute step has an `attr` and
 * no `pos`; a node's has both.
 */
function rewritesList(transaction: Transaction): boolean {
  return transaction.steps.some((step) => (step as { attr?: unknown }).attr === "comments" && !("pos" in step));
}

function mapped(placed: readonly PlacedComment[], transaction: Transaction): readonly PlacedComment[] {
  if (placed.length === 0) return placed;
  const moved: PlacedComment[] = [];
  for (const comment of placed) {
    // Start forward, end backward: typed text at either boundary lands
    // outside the comment, and a deleted span collapses the two together.
    const start = transaction.mapping.map(comment.start, 1);
    const end = transaction.mapping.map(comment.end, -1);
    // Every character it covered is gone, so the remark is about nothing.
    if (end <= start) continue;
    moved.push({ ...comment, start, end });
  }
  return moved;
}

/** The innermost comment round a position, ends included, so a click at its last letter counts. */
function innermostAt(placed: readonly PlacedComment[], at: number): string | undefined {
  let found: PlacedComment | undefined;
  for (const comment of placed) {
    if (comment.start > at || comment.end < at) continue;
    if (found === undefined || comment.end - comment.start < found.end - found.start) found = comment;
  }
  return found?.id;
}

/** The tint over each comment's words; the lit one's stronger. */
function highlightsOf(
  doc: EditorNode,
  placed: readonly PlacedComment[],
  draft: Held["draft"],
  active: string | undefined,
): DecorationSet {
  if (placed.length === 0 && draft === undefined) return DecorationSet.empty;
  const tint = (start: number, end: number, id: string): Decoration =>
    Decoration.inline(
      start,
      end,
      { class: id === active ? "comment-highlight comment-highlight--active" : "comment-highlight" },
      // As the comment's own ends: typing at either edge is outside it.
      { inclusiveStart: false, inclusiveEnd: false, comment: id },
    );
  const tints = placed.map((comment) => tint(comment.start, comment.end, comment.id));
  if (draft !== undefined) tints.push(tint(draft.start, draft.end, DRAFT_ID));
  return DecorationSet.create(doc, tints);
}

/**
 * The selection, trimmed to the elements in it: a selection that runs onto
 * the title page, which is not on the paper, covers only the script.
 */
function withinElements(doc: EditorNode, from: number, to: number): { start: number; end: number } | undefined {
  let start: number | undefined;
  let end: number | undefined;
  doc.forEach((child, offset) => {
    if (child.type.name !== "element") return;
    const inside = offset + 1;
    const after = inside + child.content.size;
    if (after <= from || inside >= to) return;
    start ??= Math.max(from, inside);
    end = Math.min(to, after);
  });
  return start !== undefined && end !== undefined && end > start ? { start, end } : undefined;
}

/* ------------------------------------------------------- ends ↔ positions */

/**
 * Each comment's two ends as document positions, read off the document: when
 * the project opens, and whenever Undo or a command rewrites the list.
 */
function placeComments(doc: EditorNode): readonly PlacedComment[] {
  const comments = held(doc);
  if (comments.length === 0) return [];

  const placed: PlacedComment[] = [];
  for (const comment of comments) {
    const start = positionOfElement(doc, paperIndex(comment.start.element), comment.start.offset);
    const end = positionOfElement(doc, paperIndex(comment.end.element), comment.end.offset);
    // Loud rather than silently dropped (ADR-0008 rule 4). `fromEditorDocument`
    // makes the same check for the same reason; a comment whose end is not a
    // place in the manuscript is a bug upstream, not a comment to discard.
    if (start === undefined || end === undefined) {
      let elements = 0;
      doc.forEach((child) => {
        if (child.type.name === "element") elements += 1;
      });
      throw new Error(`comment ${comment.id} is anchored outside a manuscript of ${elements} elements`);
    }
    placed.push({ id: comment.id, remark: comment.remark, start, end });
  }
  return placed;
}

/**
 * The comments as the model holds them, rebuilt from the positions.
 *
 * The index is the on-page one, blank lines counted. `manuscriptOf` is what
 * drops the blanks, and it relocates these ends when it does. Using the
 * manuscript numbering here would move a remark before the file was written.
 */
function commentsFrom(doc: EditorNode, placed: readonly PlacedComment[]): readonly Comment[] {
  if (placed.length === 0) return [];

  const comments: Comment[] = [];
  for (const comment of placed) {
    const start = elementAt(doc, comment.start);
    const end = elementAt(doc, comment.end);
    // Both ends were mapped out of every element there is — the manuscript no
    // longer holds the words the remark was about.
    if (start === undefined || end === undefined) continue;
    comments.push({
      id: comment.id,
      remark: comment.remark,
      start: { element: start.element, offset: start.offset },
      end: { element: end.element, offset: end.offset },
    });
  }
  return comments;
}

function same(held: readonly Comment[], rebuilt: readonly Comment[]): boolean {
  if (held.length !== rebuilt.length) return false;
  return held.every((comment, index) => {
    const other = rebuilt[index]!;
    return (
      comment.id === other.id &&
      comment.remark === other.remark &&
      comment.start.element === other.start.element &&
      comment.start.offset === other.start.offset &&
      comment.end.element === other.end.element &&
      comment.end.offset === other.end.offset
    );
  });
}
