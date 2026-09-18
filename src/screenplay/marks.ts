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
  canonicalMarks,
  renderMarked,
  scanDelimiters,
  type DelimiterSyntax,
  type Mark,
  type MarkDelimiters,
  type MarkRange,
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

export interface MarksAcross {
  /** One result per text handed in, in the same order. */
  readonly marked: readonly MarkedText[];
  /** How many marks closed in a later element than they opened in. */
  readonly spanning: number;
}

/**
 * Lift the marks out of a run of elements that no blank line separates
 * (ADR-0027).
 *
 * **A mark opens at a delimiter and closes at the next matching one, across
 * elements if that is where it closes.** The writer selected from here to
 * there and pressed the hotkey; they never typed an asterisk and cannot see
 * one, so a rule that stops the mark at a line ending invents a boundary they
 * never drew. *Big Fish* sets three sung speeches this way, and the produced
 * PDF renders all three italic.
 *
 * **The mark is nevertheless stored inside one element.** A range that reaches
 * across is clipped to each element it touches, one range each. Reading
 * crosses lines; storing does not — and neither does writing, so each element
 * emits its own pair and the file converges on the one spelling a strict
 * Fountain reader renders correctly. That is ADR-0020's eighth normalisation,
 * and `spanning` is what it reports.
 *
 * The caller decides where a run ends, and the two bounds that keep this safe
 * are both its job: **a blank line**, which ends a speech in Fountain so an
 * opener that reaches one has no partner, and **an element that holds no
 * prose** — a boneyard delimiter is `/*`, not an asterisk, and a scan that
 * paired asterisks before classifying elements would read a boneyard as one
 * long italic span.
 */
export function parseMarksAcross(texts: readonly string[]): MarksAcross {
  if (texts.length === 1) return { marked: [parseMarks(texts[0]!)], spanning: 0 };

  // Joined with the newlines the source had between them, so the scanner sees
  // the run as the writer wrote it. No screenplay element holds a newline of
  // its own (ADR-0019), so splitting the result back apart is exact.
  const raw = texts.join("\n");
  const { removals, found } = scanDelimiters(raw, SYNTAX);
  const whole = buildMarked(raw, removals, found, () => true);
  const lines = whole.text.split("\n");

  // A delimiter is never a newline, so nothing removed can have changed the
  // count. If it ever did, every offset below would be wrong and silently so.
  if (lines.length !== texts.length) {
    throw new Error(
      `mark scan changed the line count of a run: ${texts.length} in, ${lines.length} out`,
    );
  }

  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }

  const perElement: MarkRange[][] = lines.map(() => []);
  let spanning = 0;

  for (const mark of whole.marks ?? []) {
    let touched = 0;
    lines.forEach((line, index) => {
      const from = Math.max(mark.start, starts[index]!);
      const to = Math.min(mark.end, starts[index]! + line.length);
      if (to <= from) return;
      touched++;
      perElement[index]!.push({ ...mark, start: from - starts[index]!, end: to - starts[index]! });
    });
    if (touched > 1) spanning++;
  }

  const marked = lines.map((text, index) => {
    const marks = perElement[index]!;
    return marks.length === 0 ? { text } : { text, marks: canonicalMarks(marks) };
  });

  return { marked, spanning };
}

/** Put them back, in ADR-0020's declared order. */
export function renderMarks(value: MarkedText): string {
  return renderMarked(value, DELIMITERS);
}
