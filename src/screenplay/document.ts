/**
 * The screenplay document model: a flat sequence of typed elements (ADR-0019),
 * with the title page held separately as key-value fields (ADR-0021).
 *
 * Nothing here nests. A scene is a range over `elements`, computed when it is
 * wanted, never a container.
 */

/**
 * Every element Fountain defines (ADR-0021). The vocabulary belongs to the
 * surface, and this is the whole of it.
 */
export type ElementType =
  | "scene-heading"
  | "action"
  | "character"
  | "dialogue"
  | "parenthetical"
  | "transition"
  | "centered"
  | "lyrics"
  | "section"
  | "synopsis"
  | "page-break"
  | "note"
  | "boneyard";

/**
 * One element, occupying exactly one line (ADR-0019). Blank lines are not
 * elements: where one falls on the way out is derived from the pair of types
 * either side of it.
 *
 * **`boneyard` is the exception, and it is the second one.** ADR-0019 names
 * the title page as "the one exception, and it is not really an exception",
 * because it is fields rather than a text element. A `/* … *​/` block is a text
 * element and does span lines: ADR-0021 requires it "preserved exactly in the
 * file", and the corpus contains one with a blank line inside it, which a
 * model that does not store blank lines cannot hold any other way. Its `text`
 * therefore carries its own newlines.
 */
export interface Element {
  readonly type: ElementType;
  /**
   * The element's text with its forcing marker and any syntax removed. Marks
   * (`*bold*`, `_underline_`) are left in it as plain text until Phase F.
   */
  readonly text: string;
  /**
   * Leading whitespace exactly as the writer wrote it. Stripped to work out
   * the element type, then put back (issue #15) — trimming it is not on
   * ADR-0020's list of things Write-ist may change.
   */
  readonly indent: string;
  /**
   * The source carried an explicit forcing marker (`.`, `!`, `@`, `>`) for
   * this element. Preserved rather than recomputed: ADR-0020 keeps every
   * marker already in a file and adds one only where the text would otherwise
   * parse as something else.
   */
  readonly forced: boolean;
  /** Heading levels for a `section`, i.e. the number of `#` characters. */
  readonly depth?: number;
  /** A `scene-heading`'s scene number, without its `#` delimiters. */
  readonly sceneNumber?: string;
  /** A `character` cue marked for dual dialogue with a trailing `^`. */
  readonly dual?: boolean;
}

/**
 * One title-page field. Stored close to the source because the title page is
 * the one multi-line thing in the format: `Title:` may carry its value on the
 * key line, on indented continuation lines, or both.
 */
export interface TitlePageField {
  /** The key as written, without its colon — "Title", "Draft date". */
  readonly key: string;
  /** Everything after the colon on the key line, verbatim. Often `" Value"`. */
  readonly inline: string;
  /** Continuation lines, verbatim, each keeping its own indentation. */
  readonly continuations: readonly string[];
}

export interface ScreenplayDocument {
  readonly titlePage: readonly TitlePageField[];
  readonly elements: readonly Element[];
  /**
   * Whether the source ended with a newline.
   *
   * Carried rather than normalised. Four of the five fixtures end without one,
   * and "add a trailing newline" is not among ADR-0020's seven permitted
   * changes — adding it would be an eighth, which that ADR says is a decision
   * someone makes on purpose.
   */
  readonly endsWithNewline: boolean;
}
