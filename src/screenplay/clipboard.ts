/**
 * Cut, copy and paste (#47).
 *
 * Two ways in, and they are kept apart on purpose (#37, `schema.ts`):
 *
 *   - **From inside Write-ist the clipboard carries the model.** Copy writes the
 *     selected elements, their marks and their comments as JSON, in an
 *     attribute of the HTML flavour, and paste reads it back. Nothing is read
 *     out of HTML — the marks have no `parseDOM` — so an element's type, its
 *     forcing marker and its marks arrive exactly as they left.
 *   - **From anywhere else the clipboard is plain text.** Whatever HTML a Word
 *     document or a web page offers is ignored outright; the text is read as
 *     Fountain, and the formatting it came with stays behind. One line is
 *     inserted as the words it is; more than one is parsed into elements.
 *
 * Copy also writes `text/plain`, as Fountain, so another application (or
 * another Write-ist) gets something it can read without the model.
 *
 * ## Comments (ADR-0018, ADR-0008 rule 1)
 *
 * A comment is held on the document, not in the slice, so copy gathers the ones
 * the selection covers (clipped to it) and paste puts them back **with their
 * ids regenerated wherever the id is already in the document**. Copying a line
 * twice gives two comments, each independent; moving a line (cut, then paste)
 * keeps its comment's id, because the original is gone by then.
 *
 * Everything here is a function of an `EditorState` so the tests need no
 * window; the plugin at the bottom only hands the same functions to the view.
 */
import { DOMSerializer, Fragment, Slice, type Node as EditorNode } from "prosemirror-model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import type { Comment, CommentEnd } from "../comments.ts";
import { normaliseSource } from "../normalise.ts";
import { toEditorDocument, fromEditorDocument } from "./editor.ts";
import { parse } from "./parse.ts";
import { screenplaySchema } from "./schema.ts";
import { serialise } from "./serialise.ts";

/** What copy puts on the clipboard. */
export interface Copied {
  /** `text/plain`: Fountain for whole elements, the words for part of a line. */
  readonly text: string;
  /** `text/html`: carries the model for Write-ist, and nothing it reads back from. */
  readonly html: string;
}

/** What paste is given. `html` is accepted and, unless it is ours, ignored. */
export interface Incoming {
  readonly text: string;
  readonly html?: string;
}

/** A comment placed by a paste, as document positions in the pasted-into document. */
export interface PastedComment {
  readonly id: string;
  readonly remark: string;
  readonly start: number;
  readonly end: number;
}

/** Transaction meta read by `maintainComments`: comments the paste brings in. */
export const pastedComments = new PluginKey<readonly PastedComment[]>("write-ist:pasted-comments");

const MARKER = "data-write-ist";

/** The model as it travels: the slice, and the comments over it (positions within it). */
interface Carried {
  readonly version: 1;
  readonly slice: unknown;
  /** Whole elements: pasted as elements and not merged into the line it lands in. */
  readonly block: boolean;
  readonly comments: readonly PastedComment[];
}

/** A comment as the paste will place it, positions within `slice.content`. */
interface Payload {
  readonly slice: Slice;
  readonly block: boolean;
  readonly comments: readonly PastedComment[];
}

/* -------------------------------------------------------------------- copy */

/** Nothing selected, or nothing worth putting on the clipboard: `null`. */
export function copyOf(state: EditorState): Copied | null {
  const { from, to, $from, $to } = state.selection;
  if (from === to) return null;

  const inElements = $from.parent.type.name === "element" && $to.parent.type.name === "element";
  if (!inElements) {
    return { text: state.doc.textBetween(from, to, "\n"), html: "" };
  }

  const block =
    $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
  const slice = block
    ? state.doc.slice($from.before(1), $to.after(1))
    : state.doc.slice(from, to);
  // Content position 0 is where the slice starts in the document; an open slice
  // starts `openStart` tokens inside it.
  const base = block ? $from.before(1) : from - slice.openStart;

  const comments = commentsWithin(state.doc, base, base + slice.content.size, from, to);
  const carried: Carried = { version: 1, slice: slice.toJSON(), block, comments };

  const text = block
    ? serialise(fountainOf(slice.content, comments))
    : slice.content.textBetween(0, slice.content.size, "\n");
  return { text, html: `<div ${MARKER}="${escapeAttribute(JSON.stringify(carried))}"></div>` };
}

/**
 * The document's comments that the selection covers, clipped to it, as
 * positions within the copied content.
 */
function commentsWithin(
  doc: EditorNode,
  base: number,
  limit: number,
  from: number,
  to: number,
): readonly PastedComment[] {
  const held = doc.attrs["comments"];
  if (!Array.isArray(held) || held.length === 0) return [];
  const starts = elementStarts(doc);

  const found: PastedComment[] = [];
  for (const comment of held as readonly Comment[]) {
    const opens = positionOf(doc, starts, comment.start);
    const closes = positionOf(doc, starts, comment.end);
    if (opens === undefined || closes === undefined) continue;
    const start = Math.max(opens, from);
    const end = Math.min(closes, to);
    if (end <= start) continue;
    found.push({
      id: comment.id,
      remark: comment.remark,
      start: Math.max(0, start - base),
      end: Math.min(limit - base, end - base),
    });
  }
  return found;
}

/** The copied elements as a document of their own, so the serialiser can write them. */
function fountainOf(content: Fragment, comments: readonly PastedComment[]) {
  const doc = screenplaySchema.nodes["doc"]!.create(
    { comments: [], endsWithNewline: false },
    content,
  );
  const starts = elementStarts(doc);
  const placed: Comment[] = [];
  for (const comment of comments) {
    const start = endAt(doc, starts, comment.start);
    const end = endAt(doc, starts, comment.end);
    if (start === undefined || end === undefined) continue;
    placed.push({ id: comment.id, remark: comment.remark, start, end });
  }
  return fromEditorDocument(
    screenplaySchema.nodes["doc"]!.create({ comments: placed, endsWithNewline: false }, content),
  );
}

/* ------------------------------------------------------------------- paste */

/**
 * The transaction a paste makes, or `null` when there is nothing to paste.
 *
 * `mintId` makes a fresh comment id; it is a parameter so a test can say what
 * it expects instead of guessing at a random one.
 */
export function pasteTransaction(
  state: EditorState,
  incoming: Incoming,
  mintId: () => string = randomId,
): Transaction | null {
  const carried = incoming.html === undefined ? undefined : carriedIn(incoming.html);
  const payload = carried ?? payloadFromText(incoming.text);

  const inElement = state.selection.$from.parent.type.name === "element";
  const tr = state.tr;
  if (!tr.selection.empty) tr.deleteSelection();

  // Outside an element (the title page) there is nowhere for an element to go:
  // the words go in, one line.
  if (payload === undefined || !inElement) {
    const words = oneLine(incoming.text);
    if (words === "") return null;
    return tr.insertText(words).scrollIntoView();
  }

  const base = insert(tr, payload);
  placeComments(tr, state, payload, base, mintId);
  return tr.scrollIntoView();
}

/** Put the payload into the document at the caret; returns where its content starts. */
function insert(tr: Transaction, payload: Payload): number {
  const caret = tr.selection.from;
  if (!payload.block) {
    tr.replace(caret, caret, payload.slice);
    return caret - payload.slice.openStart;
  }

  const $caret = tr.doc.resolve(caret);
  const content = payload.slice.content;
  let base: number;
  if ($caret.parent.content.size === 0) {
    // A blank line is spacing, not an element (ADR-0019): the paste takes its place.
    base = $caret.before();
    tr.replaceWith(base, $caret.after(), content);
  } else if ($caret.parentOffset === 0) {
    base = $caret.before();
    tr.insert(base, content);
  } else if ($caret.parentOffset === $caret.parent.content.size) {
    base = $caret.after();
    tr.insert(base, content);
  } else {
    tr.split(caret);
    base = caret + 1;
    tr.insert(base, content);
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(base + content.size), -1));
  return base;
}

/** Hand the comments to `maintainComments`, with ids regenerated where they collide. */
function placeComments(
  tr: Transaction,
  state: EditorState,
  payload: Payload,
  base: number,
  mintId: () => string,
): void {
  if (payload.comments.length === 0) return;
  const taken = new Set<string>(
    ((state.doc.attrs["comments"] as readonly Comment[] | undefined) ?? []).map((c) => c.id),
  );

  const placed: PastedComment[] = [];
  for (const comment of payload.comments) {
    const start = base + comment.start;
    const end = base + comment.end;
    if (end <= start || end > tr.doc.content.size) continue;
    let id = comment.id;
    while (taken.has(id)) id = mintId();
    taken.add(id);
    placed.push({ id, remark: comment.remark, start, end });
  }
  if (placed.length > 0) tr.setMeta(pastedComments, placed);
}

/** The model, if this HTML is ours and intact. Anything else is not ours to read. */
function carriedIn(html: string): Payload | undefined {
  const found = new RegExp(`${MARKER}="([^"]*)"`).exec(html);
  if (found === null) return undefined;
  try {
    const carried = JSON.parse(unescapeAttribute(found[1]!)) as Carried;
    if (carried.version !== 1) return undefined;
    const slice = Slice.fromJSON(screenplaySchema, carried.slice);
    slice.content.forEach((child) => child.check());
    const size = slice.content.size;
    const comments = (carried.comments ?? []).filter(
      (c) =>
        typeof c.id === "string" &&
        typeof c.remark === "string" &&
        Number.isInteger(c.start) &&
        Number.isInteger(c.end) &&
        c.start >= 0 &&
        c.end <= size,
    );
    return { slice, block: carried.block === true, comments };
  } catch {
    return undefined;
  }
}

/**
 * Plain text from another application. One line is the words it is; more than
 * one is read as Fountain into elements, comments included.
 */
function payloadFromText(text: string): Payload | undefined {
  const source = normaliseSource(text).text.replace(/^\n+|\n+$/g, "");
  if (source === "" || !source.includes("\n")) return undefined;

  // A leading blank line keeps a first line like `Note: hello` from being read
  // as a title page, which a paste has no place for.
  const parsed = parse(`\n${source}`);
  if (parsed.elements.length === 0) return undefined;

  const doc = toEditorDocument({ ...parsed, titlePage: [] });
  const content = doc.content;
  const starts = elementStarts(doc);
  const comments: PastedComment[] = [];
  for (const comment of parsed.comments) {
    const start = starts[comment.start.element];
    const end = starts[comment.end.element];
    if (start === undefined || end === undefined) continue;
    comments.push({
      id: comment.id,
      remark: comment.remark,
      start: start + comment.start.offset,
      end: end + comment.end.offset,
    });
  }
  return { slice: new Slice(content, 0, 0), block: true, comments };
}

function oneLine(text: string): string {
  // Spaces at the edges are the writer's: this is words between other words.
  return text
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .replace(/^\n+|\n+$/g, "")
    .replace(/\s*\n\s*/g, " ");
}

/* ------------------------------------------------------------- positions */

/** Where each element's text starts, by element index. */
function elementStarts(doc: EditorNode): number[] {
  const starts: number[] = [];
  let at = 0;
  doc.forEach((child) => {
    if (child.type.name === "element") starts.push(at + 1);
    at += child.nodeSize;
  });
  return starts;
}

function positionOf(doc: EditorNode, starts: readonly number[], end: CommentEnd): number | undefined {
  const start = starts[end.element];
  if (start === undefined) return undefined;
  const element = doc.nodeAt(start - 1);
  if (element === null || end.offset > element.content.size) return undefined;
  return start + end.offset;
}

function endAt(doc: EditorNode, starts: readonly number[], position: number): CommentEnd | undefined {
  for (let element = starts.length - 1; element >= 0; element--) {
    const start = starts[element]!;
    if (position < start) continue;
    const node = doc.nodeAt(start - 1);
    if (node === null || position > start + node.content.size) return undefined;
    return { element, offset: position - start };
  }
  return undefined;
}

/* ---------------------------------------------------------------- escaping */

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function randomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/* ------------------------------------------------------------------ plugin */

/** What the copy in flight is carrying; copy is synchronous, so one is enough. */
let copying: Copied | null = null;

/** The default page rendering, with the model added to the outermost element. */
class ModelSerializer extends DOMSerializer {
  override serializeFragment(
    fragment: Fragment,
    options: { document?: Document } = {},
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const out = super.serializeFragment(fragment, options, target);
    if (target === undefined && copying !== null && copying.html !== "") {
      const first = out.firstChild;
      const carried = new RegExp(`${MARKER}="([^"]*)"`).exec(copying.html);
      if (first !== null && first.nodeType === 1 && carried !== null) {
        (first as HTMLElement).setAttribute(MARKER, unescapeAttribute(carried[1]!));
      }
    }
    return out;
  }
}

const base = DOMSerializer.fromSchema(screenplaySchema);

/**
 * Hands the functions above to the view: copy and cut write the model, paste
 * reads it or, failing that, the plain text. HTML from elsewhere is discarded
 * before ProseMirror can read it (`transformPastedHTML`), so there is no second
 * way into the model.
 */
export const clipboard = new Plugin({
  props: {
    transformCopied: (slice, view) => {
      copying = copyOf(view.state);
      return slice;
    },
    clipboardSerializer: new ModelSerializer(base.nodes, base.marks),
    clipboardTextSerializer: (slice) =>
      copying?.text ?? slice.content.textBetween(0, slice.content.size, "\n"),
    transformPastedHTML: () => "",
    handlePaste: (view, event) => {
      const data = event.clipboardData;
      const tr = pasteTransaction(view.state, {
        text: data?.getData("text/plain") ?? "",
        html: data?.getData("text/html") ?? "",
      });
      if (tr !== null) view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste"));
      return true;
    },
  },
});
