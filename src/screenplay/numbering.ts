/**
 * The numberings of the editor's document, and the one walk that makes them.
 *
 * An element has three addresses, and they are not the same number
 * (`docs/STANDARDS.md`: the visual index and the model index). Each is its own
 * type here, so handing one where another is wanted is a type error and not an
 * off-by-one found in a screenplay:
 *
 * - **A position** — ProseMirror's own, a place between characters.
 * - **On the paper** — among the element lines the writer sees. The title page
 *   is not an element. A blank line *is* one while the writer is standing on
 *   it: deleting a line's text leaves one, and the caret has to have somewhere
 *   to be. Comment ends and paste use this numbering, because it is the
 *   document they are held on until `manuscriptOf` writes the file.
 * - **In the manuscript** — among the elements the file would hold. A blank
 *   line is spacing there, not an element (ADR-0019). The page count, the
 *   layout and search use this one. A blank line answers with the manuscript
 *   element before it, or 0 when nothing precedes it.
 *
 * The rule for which lines are elements lives here and nowhere else: callers
 * ask, they do not walk. The walk is done once per document (a document is
 * immutable, so the answer is kept against it), which is what lets the layout,
 * the seams and the pairing all ask per keystroke without each paying for it.
 * Asking which element a *spot* is does not walk — it reads the document's
 * depth — so it costs the same on a hundred elements and on three thousand.
 */
import type { Node as EditorNode } from "prosemirror-model";
import type { ElementType } from "./document.ts";

declare const position: unique symbol;
declare const paper: unique symbol;
declare const manuscript: unique symbol;

/** A place in the editor's document, as ProseMirror counts. */
export type DocPosition = number & { readonly [position]: true };
/** An element's number among the lines on the paper, blank lines counted. */
export type PaperIndex = number & { readonly [paper]: true };
/** An element's number among the elements in the file, blank lines omitted. */
export type ManuscriptIndex = number & { readonly [manuscript]: true };

/*
 * Naming a plain number is for the edges, where one arrives from outside this
 * module (a comment's anchor, the layout's element index) and the numbering it
 * is in is known from where it came. Inside the module they are never cast.
 */
export const paperIndex = (n: number): PaperIndex => n as PaperIndex;
export const manuscriptIndex = (n: number): ManuscriptIndex => n as ManuscriptIndex;

/** One element that is in the file: its number, where it begins, and what it is. */
export interface ManuscriptElement {
  readonly index: ManuscriptIndex;
  /** The position before its node. */
  readonly pos: DocPosition;
  readonly node: EditorNode;
}

/** A spot that falls inside an element on the paper. */
export interface ElementAt {
  readonly element: PaperIndex;
  /** Offset within that element's text. */
  readonly offset: number;
  readonly type: ElementType;
}

interface Walk {
  /** Every line on the paper, in order, with where it begins. */
  readonly paper: readonly { readonly pos: DocPosition; readonly node: EditorNode }[];
  readonly manuscript: readonly ManuscriptElement[];
  /** For each line on the paper, how many manuscript elements come before it. */
  readonly manuscriptBefore: readonly number[];
}

const walks = new WeakMap<EditorNode, Walk>();

function walkOf(doc: EditorNode): Walk {
  const kept = walks.get(doc);
  if (kept !== undefined) return kept;

  const lines: Walk["paper"][number][] = [];
  const elements: ManuscriptElement[] = [];
  const before: number[] = [];
  let at = 0;
  doc.forEach((node) => {
    if (node.type.name === "element") {
      lines.push({ pos: at as DocPosition, node });
      before.push(elements.length);
      // A blank line is spacing, not a manuscript element (ADR-0019).
      if (node.content.size > 0) {
        elements.push({ index: elements.length as ManuscriptIndex, pos: at as DocPosition, node });
      }
    }
    at += node.nodeSize;
  });
  const walk = { paper: lines, manuscript: elements, manuscriptBefore: before };
  walks.set(doc, walk);
  return walk;
}

/** How many title-page lines the document opens with. They come first. */
export function leadingTitleLines(doc: EditorNode): number {
  let lines = 0;
  while (lines < doc.childCount && doc.child(lines).type.name === "title_line") lines += 1;
  return lines;
}

/**
 * The elements that are in the file, in order. Blank lines the writer is
 * standing on are not among them, and the title page is not an element.
 */
export function manuscriptElements(doc: EditorNode): readonly ManuscriptElement[] {
  return walkOf(doc).manuscript;
}

/** The position a manuscript element begins at, or undefined when there is no such element. */
export function startOfManuscriptElement(
  doc: EditorNode,
  index: ManuscriptIndex,
): DocPosition | undefined {
  return walkOf(doc).manuscript[index]?.pos;
}

/**
 * The element containing `position`, or undefined when the spot is on the
 * title page or between elements.
 */
export function elementAt(doc: EditorNode, at: number): ElementAt | undefined {
  const $at = doc.resolve(at);
  if ($at.depth !== 1 || $at.parent.type.name !== "element") return undefined;
  const type = $at.parent.attrs["type"];
  if (typeof type !== "string") return undefined;
  return {
    element: paperIndex($at.index(0) - leadingTitleLines(doc)),
    offset: $at.parentOffset,
    type: type as ElementType,
  };
}

/**
 * The position of `offset` within the element numbered `element` on the paper.
 * Undefined when there is no such element, or the offset runs past its text.
 */
export function positionOfElement(
  doc: EditorNode,
  element: PaperIndex,
  offset: number,
): DocPosition | undefined {
  const line = walkOf(doc).paper[element];
  if (line === undefined || offset > line.node.content.size) return undefined;
  return (line.pos + 1 + offset) as DocPosition;
}

/**
 * Which manuscript element `at` belongs to, blank lines omitted.
 *
 * Undefined on the title page. A blank line is not in the manuscript, so the
 * answer is the manuscript element before it — or 0, when nothing precedes it.
 * That is the index `repaginate` already expects.
 */
export function manuscriptElementAt(doc: EditorNode, at: number): ManuscriptIndex | undefined {
  const place = elementAt(doc, at);
  if (place === undefined) return undefined;
  const walk = walkOf(doc);
  const before = walk.manuscriptBefore[place.element]!;
  const blank = walk.paper[place.element]!.node.content.size === 0;
  return manuscriptIndex(blank ? Math.max(before - 1, 0) : before);
}
