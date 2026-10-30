/**
 * The document model, into the editor and back out of it (#39).
 *
 * ADR-0019 makes the model canonical and the file a rendering of it. ADR-0024
 * makes ProseMirror the editing engine. This file is the only place the two
 * meet: **the editor's document is built from the model and read back into it**,
 * and the manuscript on disk is only ever produced by the existing serialiser
 * from the model this returns — never from ProseMirror's own format and never
 * from the DOM.
 *
 * ## The gate
 *
 * `document → editor → document` must be the identity, and the test for it is
 * not only the bytes. ADR-0021 records the defect twice: two scene headings
 * read as action while every byte test passed, because an unforced heading and
 * an action line with the same text serialise identically. So the census —
 * types, marks, comments, `dual`, `omitted` — is asserted beside the bytes in
 * `test/editor/round-trip.test.ts`.
 *
 * ## What ProseMirror cannot hold, and why that is a decision
 *
 * **Two marks of the same kind that touch but are separate.** ProseMirror's
 * marks are a set per character, so `italic` over 0–1 and `italic` over 1–2 are
 * the same thing as `italic` over 0–2 — there is nowhere to put the seam.
 * ADR-0019 chose set semantics on its own reasoning and ADR-0024 records that
 * the library agreeing is convenient rather than causal, so this is the
 * semantics we asked for rather than a limitation we inherited. It is recorded
 * here because the consequence runs the other way too: a range the editor
 * splits across text nodes has to be **merged back**, or a single italic span
 * reached by a bold span inside it would be written out as two spans and move
 * bytes.
 *
 * ## Element identity
 *
 * ADR-0019 wants "the handle the editor holds on an element while the project
 * is open, so that it can redraw incrementally". A ProseMirror node *is* that
 * handle: nodes are persistent values, so an element untouched by a transaction
 * is the same object afterwards, and one that changed is a different object. It
 * is created here, it dies when the project closes, and it is never written to
 * a file — which is exactly what that ADR asks of it, and why nothing in this
 * file mints an id.
 */
import { Fragment, Node as EditorNode } from "prosemirror-model";
import type { Comment } from "../comments.ts";
import { canonicalMarks, type Mark, type MarkRange, type MarkedText } from "../marks.ts";
import type {
  Element,
  ElementType,
  MarkedValue,
  ScreenplayDocument,
  TitlePageField,
} from "./document.ts";
import { screenplaySchema } from "./schema.ts";

/**
 * Build the editor's document from the model.
 *
 * The title page's fields become a run of lines each — the key on the first,
 * the continuations after it — and every element becomes one textblock. The
 * comments and the trailing newline ride on the document node, because they
 * belong to the file rather than to any line of it.
 */
export function toEditorDocument(document: ScreenplayDocument): EditorNode {
  const lines = document.titlePage.flatMap((field) => [
    titleLine(field.key, field.inline, field.key, 0),
    ...field.continuations.map((continuation, index) =>
      titleLine(null, continuation, field.key, index + 1),
    ),
  ]);

  const elements = document.elements.map((element) =>
    screenplaySchema.nodes["element"]!.create(
      {
        type: element.type,
        forced: element.forced,
        depth: element.depth ?? null,
        sceneNumber: element.sceneNumber ?? null,
        dual: element.dual === true,
        omitted: element.omitted === true,
      },
      markedContent(element),
    ),
  );

  return screenplaySchema.nodes["doc"]!.create(
    { comments: document.comments, endsWithNewline: document.endsWithNewline },
    [...lines, ...elements],
  );
}

/**
 * Read the model back out of the editor's document.
 *
 * Every optional field is **omitted rather than set to undefined**, so the
 * result is the same shape the parser produces and the round-trip gate can
 * compare the two whole.
 */
export function fromEditorDocument(document: EditorNode): ScreenplayDocument {
  const titlePage: TitlePageField[] = [];
  const elements: Element[] = [];

  document.forEach((node) => {
    if (node.type.name === "title_line") {
      const value = markedValueOf(node);
      const key = node.attrs["key"];
      if (typeof key === "string") {
        titlePage.push({ key, inline: value, continuations: [] });
        return;
      }
      const field = titlePage[titlePage.length - 1];
      if (field === undefined) {
        // Unreachable from `toEditorDocument`, which never writes a
        // continuation before a key. Loud rather than silently dropped
        // (ADR-0008 rule 4): a lost address line is a lost address line.
        throw new Error("a title-page continuation line has no field above it");
      }
      titlePage[titlePage.length - 1] = {
        ...field,
        continuations: [...field.continuations, value],
      };
      return;
    }

    elements.push(elementOf(node));
  });

  const comments = commentsOf(document, elements);
  return {
    titlePage,
    elements,
    comments,
    endsWithNewline: document.attrs["endsWithNewline"] === true,
  };
}

/* ------------------------------------------------------------------- lines */

function titleLine(
  key: string | null,
  value: MarkedValue,
  field: string,
  fieldLine: number,
): EditorNode {
  return screenplaySchema.nodes["title_line"]!.create(
    { key, field, fieldLine },
    markedContent(value),
  );
}

function elementOf(node: EditorNode): Element {
  const marks = marksOf(node);
  const depth = node.attrs["depth"];
  const sceneNumber = node.attrs["sceneNumber"];

  return {
    type: node.attrs["type"] as ElementType,
    text: node.textContent,
    ...(marks.length === 0 ? {} : { marks }),
    forced: node.attrs["forced"] === true,
    ...(typeof depth === "number" ? { depth } : {}),
    ...(typeof sceneNumber === "string" ? { sceneNumber } : {}),
    ...(node.attrs["dual"] === true ? { dual: true } : {}),
    ...(node.attrs["omitted"] === true ? { omitted: true } : {}),
  };
}

function markedValueOf(node: EditorNode): MarkedValue {
  const marks = marksOf(node);
  return marks.length === 0 ? { text: node.textContent } : { text: node.textContent, marks };
}

/* ------------------------------------------------------------------- marks */

/** One text node per run of characters carrying the same set of marks. */
function markedContent(value: MarkedText): Fragment {
  const ranges = value.marks ?? [];
  if (value.text === "") return Fragment.empty;
  if (ranges.length === 0) return Fragment.from(screenplaySchema.text(value.text));

  const boundaries = [
    ...new Set([0, value.text.length, ...ranges.flatMap((range) => [range.start, range.end])]),
  ]
    .filter((at) => at > 0 && at < value.text.length)
    .sort((a, b) => a - b);

  const edges = [0, ...boundaries, value.text.length];
  const nodes: EditorNode[] = [];
  for (let index = 0; index < edges.length - 1; index++) {
    const from = edges[index]!;
    const to = edges[index + 1]!;
    const covering = ranges
      .filter((range) => range.start <= from && range.end >= to)
      .map((range) =>
        screenplaySchema.marks[range.mark]!.create({ spelling: range.spelling ?? null }),
      );
    nodes.push(screenplaySchema.text(value.text.slice(from, to), covering));
  }

  return Fragment.fromArray(nodes);
}

/**
 * The marks over one textblock, as ranges over its text.
 *
 * **Touching runs of the same mark are one range.** ProseMirror splits a text
 * node wherever any mark starts or ends, so an italic span with a bold span
 * inside it arrives as two italic-bearing nodes; emitted as two ranges it would
 * be written `*ab***cd***` instead of `*ab**cd***`, which moves bytes. Merging
 * is therefore not tidiness, it is the round-trip.
 */
function marksOf(node: EditorNode): readonly MarkRange[] {
  const found: MarkRange[] = [];
  let at = 0;

  node.forEach((child) => {
    const width = child.text?.length ?? child.nodeSize;
    for (const mark of child.marks) {
      const spelling = mark.attrs["spelling"];
      const range: MarkRange = {
        mark: mark.type.name as Mark,
        start: at,
        end: at + width,
        ...(typeof spelling === "string" ? { spelling } : {}),
      };
      const previous = found.find(
        (held) =>
          held.mark === range.mark && held.spelling === range.spelling && held.end === range.start,
      );
      if (previous === undefined) {
        found.push(range);
        continue;
      }
      found[found.indexOf(previous)] = { ...previous, end: range.end };
    }
    at += width;
  });

  return canonicalMarks(found);
}

/* ---------------------------------------------------------------- comments */

/**
 * The comments held on the document, checked against the elements they point
 * into.
 *
 * Each end is an element index and an offset (ADR-0018). Nothing in this ticket
 * edits, so nothing moves them — and **that is exactly why the check is here.**
 * The first edit that inserts or removes an element invalidates every index
 * after it, and a comment quietly landing on the wrong words is the v1 failure
 * ADR-0018 was written from the corpse of. Failing loudly is ADR-0008 rule 4,
 * and it puts the work in front of whoever turns typing on rather than behind
 * them.
 */
function commentsOf(document: EditorNode, elements: readonly Element[]): readonly Comment[] {
  const held = document.attrs["comments"];
  if (!Array.isArray(held)) return [];

  const comments = held as readonly Comment[];
  for (const comment of comments) {
    for (const [which, end] of [
      ["opens", comment.start],
      ["closes", comment.end],
    ] as const) {
      const element = elements[end.element];
      if (element === undefined || end.offset > element.text.length) {
        throw new Error(
          `comment ${comment.id} ${which} at element ${end.element} offset ${end.offset}, ` +
            `which is not a place in a manuscript of ${elements.length} elements`,
        );
      }
    }
  }
  return comments;
}
