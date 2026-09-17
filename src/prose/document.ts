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
  | "passthrough";

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
  /**
   * The exact line prefix of a `block-quote` or `verse` line — `"> "`, `">"`,
   * `"| "`. Kept because the writer may write either spelling and a bare `>`
   * is how a blank line inside a quote is spelled.
   *
   * Whatever follows the marker is the element's text, indentation included:
   * inside verse, leading whitespace is authored and meaningful (ADR-0023),
   * which is what makes the line block the mechanism poetry runs on.
   */
  readonly marker?: string;
}

export interface ProseDocument {
  readonly elements: readonly ProseElement[];
  /** Whether the source ended with a newline. Carried, never added. */
  readonly endsWithNewline: boolean;
}
