/**
 * Fountain's spelling of a mark: `*italic*`, `**bold**`, `_underline_`.
 *
 * `***x***` is both asterisk marks at once, which the shared scanner reads by
 * spending two of the three asterisks on the bold and the last on the italic.
 * That is not a special case here; it falls out of marks being a set.
 *
 * Fountain has no small caps, so `smallcaps` never appears on this surface and
 * has no delimiter below.
 *
 * ADR-0011's trap lives at this boundary: `_x_` is **underline** here and
 * *italics* in Markdown. The same characters, two surfaces, opposite meanings,
 * which is why each surface states its own table rather than sharing one.
 */
import {
  buildMarked,
  renderMarked,
  scanDelimiters,
  type DelimiterSyntax,
  type Mark,
  type MarkDelimiters,
  type MarkedText,
} from "../marks.ts";

const SYNTAX: DelimiterSyntax = {
  "*": { one: "italic", two: "bold", maxRun: 3, intraword: true },
  // Fountain gives `_` one meaning and one length. A run of two or more is
  // therefore text, not an underline spelled loudly.
  _: { one: "underline", two: null, maxRun: 1, intraword: false },
};

const DELIMITERS: MarkDelimiters = {
  open: (range) => spelling(range.mark),
  close: (range) => spelling(range.mark),
};

/** Fountain spells every mark the same at both ends. */
function spelling(mark: Mark): string {
  switch (mark) {
    case "italic":
      return "*";
    case "bold":
      return "**";
    case "underline":
      return "_";
    case "smallcaps":
      // Unreachable from this parser, and unspellable in Fountain. Losing the
      // mark rather than inventing a syntax keeps the text intact, which is
      // the side of ADR-0020's line that matters.
      return "";
  }
}

/** Lift the marks out of one element's text. */
export function parseMarks(raw: string): MarkedText {
  const { removals, found } = scanDelimiters(raw, SYNTAX);
  return buildMarked(raw, removals, found, () => true);
}

/** Put them back, in ADR-0020's declared order. */
export function renderMarks(value: MarkedText): string {
  return renderMarked(value, DELIMITERS);
}
