/**
 * The prose document model: a flat sequence of typed elements, as on the
 * screenplay surface (ADR-0019), over the subset of Pandoc Markdown that
 * Write-ist specifies (ADR-0011, ADR-0023).
 *
 * Two things differ from screenplay, and both come from Markdown being a
 * format rather than a convention.
 *
 * **A blank line is syntax here, not spacing.** On the screenplay surface a
 * blank line is a convention the serialiser derives from the types either side
 * of it. In Markdown two paragraphs with no blank line between them are *one
 * paragraph*. Getting the spacing wrong there does not make the file untidy,
 * it changes what the document says.
 *
 * **One element may span lines, because a paragraph does.** Prose is
 * hard-wrapped — the acceptance fixture has paragraphs up to 72 lines long —
 * and the wrap positions are the writer's bytes. Re-wrapping them is not on
 * ADR-0020's list of things Write-ist may change, so a paragraph is one
 * element whose text carries its own newlines. ADR-0019's one element, one
 * line was measured on screenplays, where no such construct exists.
 */
import type { MarkRange } from "../marks.ts";

/**
 * The elements of ADR-0023's vocabulary this parser recognises so far.
 *
 * Anything it does not recognise is a paragraph, which is lossless: a
 * paragraph's text is its lines verbatim. That is the prose counterpart of
 * Fountain making action the catch-all — wrong about the element, never wrong
 * about the bytes (ADR-0020).
 *
 * Two of ADR-0023's named constructs are deliberately absent, because they are
 * **regions** rather than element types. An *epigraph* is syntactically an
 * ordinary block quote; what makes it an epigraph is standing before the first
 * part. *Front and back matter* are likewise everything before the first part
 * and after the last chapter. Both are ranges computed over the sequence, the
 * same treatment `CONTEXT.md` gives a scene, a chapter and a part.
 */
export type ProseElementType =
  | "heading"
  | "paragraph"
  | "scene-break"
  | "block-quote"
  | "verse"
  | "footnote"
  | "cut-start"
  | "cut-end"
  | "passthrough";

export interface ProseElement {
  readonly type: ProseElementType;
  /**
   * The element's text, including the author's line wraps and any leading
   * whitespace, with the mark syntax taken out of it and held in `marks`.
   * Comments and chapter ids stay in it as plain text.
   *
   * A `block-quote` or `verse` element holds its whole block, with the `>` or
   * `|` markers taken off each line — an empty line in there is the blank line
   * the block was written with. The blank line is the block boundary: two
   * quotes with a blank between them are two elements, and two quote lines
   * with none are one.
   */
  readonly text: string;
  /**
   * Inline formatting over `text`, as a set of ranges (ADR-0019), absent
   * rather than empty when there is none.
   *
   * A range may cross a line wrap, which it cannot on the screenplay surface:
   * a paragraph is one element holding all its lines, and the acceptance
   * fixture underlines a phrase that breaks across two of them.
   *
   * Four types never carry marks. A **passthrough** is an exact copy of its
   * own text and is never reinterpreted (ADR-0020). A **scene break** and the
   * two **cut delimiters** are punctuation, and their characters — `* * *`,
   * `***` — are the ones a mark is spelled with. A **footnote** is left whole
   * because ADR-0023 keeps the syntax in the subset while deferring the
   * authoring feature; there is nothing yet to show its marks in.
   */
  readonly marks?: readonly MarkRange[];
  /**
   * Heading level, 1 to 6. Parts and chapters are *ranges* over the sequence
   * computed from these, never element types of their own — `CONTEXT.md` fixes
   * that, and it is why the book's own title and a front-matter heading do not
   * have to be mistaken for a part and a chapter.
   */
  readonly level?: number;
  /**
   * A setext heading's underline, exactly as written — `------`, `===`.
   *
   * Its presence is what makes the heading setext rather than ATX. Markdown
   * spells the same element several ways, and emitting a canonical spelling
   * would silently rewrite a file that meant the same thing in different
   * characters. The element remembers how it was written, as a forced marker,
   * a scene number and a dual-dialogue caret already do on the other surface.
   */
  readonly underline?: string;
  /**
   * The element lies inside a cut, between `<!--cut-->` and its closing
   * delimiter — prose's counterpart to the screenplay boneyard (ADR-0023),
   * and modelled the same way (ADR-0021): delimiters with a flag on what lies
   * between, never a container, and carrying no id.
   *
   * As on the other surface, the material is a full element in every other
   * respect. What the flag governs is what is left out of pagination, the word
   * and page counts, and export.
   */
  readonly omitted?: boolean;
}

export interface ProseDocument {
  readonly elements: readonly ProseElement[];
  /** Whether the source ended with a newline. Carried, never added. */
  readonly endsWithNewline: boolean;
}
