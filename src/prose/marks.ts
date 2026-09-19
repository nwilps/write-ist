/**
 * Markdown's spelling of a mark, over the subset ADR-0011 specifies.
 *
 * Two families, and they behave differently:
 *
 *   - **Emphasis** — `*italic*` and `**bold**` — is delimiter runs, read by
 *     the same scanner Fountain uses.
 *   - **Underline and small caps** are Pandoc's bracketed span,
 *     `[word]{.underline}`. Markdown has no other way to say either, which
 *     ADR-0011 records as the price of the format: a plain CommonMark reader
 *     shows the markup, and the text is intact regardless.
 *
 * ADR-0011's trap is the reason this file exists rather than sharing
 * Fountain's table: **`_word_` is italics here and underline there.** Same
 * characters, two surfaces, opposite meanings.
 *
 * That makes `_` a second spelling of two marks Markdown already spells with
 * `*`, and it is the first place a mark has more than one. The spelling is
 * remembered on the range, as a setext heading's underline is, because
 * emitting our favourite would rewrite a file that already said what it meant
 * — a change ADR-0020 does not permit.
 */
import {
  buildMarkedMapped,
  renderMarked,
  scanDelimiters,
  type DelimiterSyntax,
  type Mark,
  type MarkDelimiters,
  type MarkRange,
  type MappedMarks,
  type MarkedText,
  type RawMark,
  type Removal,
} from "../marks.ts";

const SYNTAX: DelimiterSyntax = {
  "*": { one: "italic", two: "bold", maxRun: 3, intraword: true },
  _: { one: "italic", two: "bold", maxRun: 3, intraword: false },
};

/**
 * What we write when the source did not choose for us.
 *
 * Only emphasis appears here. Underline and small caps have exactly one
 * spelling each, so there is nothing for a range to remember about them.
 */
const DEFAULT_SPELLING: Readonly<Record<string, string>> = { italic: "*", bold: "**" };

/** The bracketed spans in the subset, by the class that spells each. */
const CLASSES: Readonly<Record<string, Mark>> = {
  ".underline": "underline",
  ".smallcaps": "smallcaps",
};

const DELIMITERS: MarkDelimiters = {
  open: (range) => (bracketed(range.mark) ? "[" : emphasis(range)),
  close: (range) => (bracketed(range.mark) ? `]{.${range.mark}}` : emphasis(range)),
};

const bracketed = (mark: Mark): boolean => mark === "underline" || mark === "smallcaps";

const emphasis = (range: MarkRange): string => range.spelling ?? DEFAULT_SPELLING[range.mark]!;

/** Lift the marks out of one element's text. */
export function parseMarks(raw: string): MarkedText {
  return parseMarksMapped(raw).marked;
}

/** `parseMarks`, also reporting where each raw position ended up. */
export function parseMarksMapped(raw: string): MappedMarks {
  const spans = scanSpans(raw);
  const runs = scanDelimiters(raw, SYNTAX);

  return buildMarkedMapped(
    raw,
    [...spans.removals, ...runs.removals],
    [...spans.found, ...runs.found],
    (mark, spelling) => DEFAULT_SPELLING[mark] === undefined || DEFAULT_SPELLING[mark] === spelling,
  );
}

/**
 * Put them back, in ADR-0020's declared order, with any comment delimiters
 * inserted at their offsets.
 */
export function renderMarks(
  value: MarkedText,
  inserts?: ReadonlyMap<number, string>,
): string {
  return renderMarked(value, DELIMITERS, inserts);
}

/**
 * Find Pandoc's bracketed spans: `[text]{.underline}`.
 *
 * A stack of open brackets, so a span nested in a span closes against the
 * right one. A `]` that is not followed by a recognised attribute block simply
 * closes its bracket and is left in the text — which is what keeps a footnote
 * reference `[^jowett]` a footnote reference, and an unknown class a pair of
 * ordinary brackets rather than a mark this surface cannot write back.
 *
 * A span may cross a line wrap. Unlike the screenplay surface, a prose element
 * holds all its lines, and the acceptance fixture underlines a phrase that
 * breaks across two of them.
 */
function scanSpans(raw: string): { removals: Removal[]; found: RawMark[] } {
  const removals: Removal[] = [];
  const found: RawMark[] = [];
  const open: number[] = [];

  for (let index = 0; index < raw.length; index++) {
    if (raw[index] === "\\") {
      index++;
      continue;
    }
    if (raw[index] === "[") {
      open.push(index);
      continue;
    }
    if (raw[index] !== "]") continue;

    const start = open.pop();
    if (start === undefined || raw[index + 1] !== "{") continue;

    const attributesEnd = raw.indexOf("}", index + 2);
    if (attributesEnd === -1) continue;

    const marks = classesToMarks(raw.slice(index + 2, attributesEnd));
    if (marks === null || index === start + 1) continue;

    for (const mark of marks) {
      found.push({ mark, start: start + 1, end: index, spelling: `.${mark}` });
    }
    removals.push(
      { start, end: start + 1 },
      { start: index, end: attributesEnd + 1 },
    );
    index = attributesEnd;
  }

  return { removals, found };
}

/**
 * The marks an attribute block spells, or null if it spells anything else.
 *
 * All or nothing: `{.underline .footnote}` is not an underline plus something
 * we dropped, it is an attribute block outside the subset, and the whole span
 * stays in the text as written. Silently keeping the half we understand is how
 * a file stops saying what its writer wrote.
 */
function classesToMarks(attributes: string): Mark[] | null {
  const classes = attributes.trim().split(/\s+/);
  if (attributes.trim() === "") return null;

  const marks: Mark[] = [];
  for (const name of classes) {
    const mark = CLASSES[name];
    if (mark === undefined) return null;
    marks.push(mark);
  }
  return marks;
}
