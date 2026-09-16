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

/**
 * The elements of ADR-0023's vocabulary this parser recognises so far.
 *
 * Anything it does not recognise is a paragraph, which is lossless: a
 * paragraph's text is its lines verbatim. That is the prose counterpart of
 * Fountain making action the catch-all — wrong about the element, never wrong
 * about the bytes (ADR-0020).
 */
export type ProseElementType = "heading" | "paragraph" | "scene-break";

export interface ProseElement {
  readonly type: ProseElementType;
  /**
   * The element's text, verbatim, including the author's line wraps and any
   * leading whitespace. Marks, comments and chapter ids stay in it as plain
   * text until Phase F.
   */
  readonly text: string;
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
}

export interface ProseDocument {
  readonly elements: readonly ProseElement[];
  /** Whether the source ended with a newline. Carried, never added. */
  readonly endsWithNewline: boolean;
}
