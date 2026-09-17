/**
 * Reading Markdown into the flat prose element sequence.
 *
 * Prose is sigils where screenplay is inference: `#` is a heading, `* * *` a
 * scene break. There is very little to guess. What Markdown has instead is
 * **several spellings of the same element**, and that is the whole of the
 * difficulty — read `* * *`, `---` and `***` into one type, emit your own
 * favourite, and you have rewritten a file that meant the same thing.
 *
 * So every element remembers how it was spelled.
 *
 * Input is expected to have been through `normaliseSource`.
 */
import type { ProseDocument, ProseElement } from "./document.ts";

/** `## Heading`. Exactly one space, so an oddly spaced line stays a paragraph. */
const ATX_HEADING = /^(#{1,6}) (.*)$/;

/**
 * A thematic break: three or more `*`, `-` or `_`, optionally spaced.
 *
 * Covers `* * *`, `***`, `---` and `___`, which is four spellings of one
 * element before anyone has been creative.
 */
const THEMATIC_BREAK = /^(?:\*[ \t]*){3,}$|^(?:-[ \t]*){3,}$|^(?:_[ \t]*){3,}$/;

/**
 * A setext underline: a run of `=` or `-` directly beneath the heading text.
 *
 * `-` is the ambiguity worth knowing about. After a blank line `---` is a
 * scene break; directly under a line of text the same characters are a
 * heading underline. Only the preceding line tells them apart, which is why
 * this is tested at the point a run of text ends rather than at block start.
 */
const SETEXT_UNDERLINE = /^(?:=+|-{2,})$/;

/** A block-quote line. `>` alone is how a blank line inside a quote is spelled. */
const QUOTE_LINE = /^(>[ ]?)(.*)$/;

/** A line beginning with a pipe: Pandoc's line block, or a pipe table. */
const PIPE_LINE = /^(\|[ ]?)(.*)$/;

/**
 * A pipe table's delimiter row — pipes, dashes, colons and spaces, nothing
 * else, and at least one dash.
 *
 * This is the whole of what tells a table from verse, because both begin with
 * `|`. A table is outside the subset Write-ist specifies, so it is a
 * passthrough: kept as an exact copy of its own text and never reinterpreted
 * (ADR-0020). Verse is in the subset and is read line by line.
 */
const TABLE_DELIMITER = /^\|[ :|-]*-[ :|-]*$/;

export function parse(text: string): ProseDocument {
  const endsWithNewline = text.endsWith("\n");
  const lines = text.split("\n");
  if (endsWithNewline) lines.pop();

  const elements: ProseElement[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    // A blank line is syntax, but it is not an element: it separates blocks,
    // and where one falls on the way out is derived from the pair either side.
    if (line === "") {
      index++;
      continue;
    }

    const atx = ATX_HEADING.exec(line);
    if (atx !== null) {
      elements.push({ type: "heading", text: atx[2]!, level: atx[1]!.length });
      index++;
      continue;
    }

    // At a block start, these characters are a thematic break. The same
    // characters under a line of text are handled below, as an underline.
    if (THEMATIC_BREAK.test(line)) {
      elements.push({ type: "scene-break", text: line });
      index++;
      continue;
    }

    if (QUOTE_LINE.test(line)) {
      index = readMarkedRun(lines, index, elements, "block-quote", QUOTE_LINE);
      continue;
    }

    if (PIPE_LINE.test(line)) {
      index = readPipeRun(lines, index, elements);
      continue;
    }

    index = readTextBlock(lines, index, elements);
  }

  return { elements, endsWithNewline };
}

/**
 * Read a run of consecutive non-blank lines, and decide what it was.
 *
 * A run followed by a setext underline is a heading, and its text is the whole
 * run — that is Markdown's rule, not a simplification. Otherwise the run is a
 * paragraph, holding its lines exactly as the writer wrapped them.
 */
function readTextBlock(
  lines: readonly string[],
  start: number,
  elements: ProseElement[],
): number {
  let end = start;
  while (end < lines.length && lines[end] !== "") {
    // A line that opens a block interrupts the paragraph. Checked only past
    // the first line, because at the first line the caller already looked.
    if (end > start && interrupts(lines[end]!)) break;
    end++;
  }

  const underline = end < lines.length ? lines[end] : undefined;
  const text = lines.slice(start, end).join("\n");

  if (underline !== undefined && underline !== "" && SETEXT_UNDERLINE.test(underline)) {
    elements.push({
      type: "heading",
      text,
      level: underline.startsWith("=") ? 1 : 2,
      underline,
    });
    return end + 1;
  }

  elements.push({ type: "paragraph", text });
  return end;
}

/**
 * A run of lines sharing a prefix, one element per line.
 *
 * A quote line and a verse line are each an element, and no blank line falls
 * between two of them — in a line block a blank would end the block, and in a
 * quote it would start a second one.
 */
function readMarkedRun(
  lines: readonly string[],
  start: number,
  elements: ProseElement[],
  type: "block-quote" | "verse",
  pattern: RegExp,
): number {
  let index = start;
  while (index < lines.length) {
    const match = pattern.exec(lines[index]!);
    if (match === null) break;
    elements.push({ type, text: match[2]!, marker: match[1]! });
    index++;
  }
  return index;
}

/**
 * A run of lines beginning with `|`: a pipe table if its second line is a
 * delimiter row, otherwise Pandoc's line block, which is verse.
 */
function readPipeRun(
  lines: readonly string[],
  start: number,
  elements: ProseElement[],
): number {
  const second = lines[start + 1];
  if (second === undefined || !TABLE_DELIMITER.test(second)) {
    return readMarkedRun(lines, start, elements, "verse", PIPE_LINE);
  }

  let end = start;
  while (end < lines.length && PIPE_LINE.test(lines[end]!)) end++;
  elements.push({ type: "passthrough", text: lines.slice(start, end).join("\n") });
  return end;
}

/** Whether this line ends the paragraph above it rather than continuing it. */
function interrupts(line: string): boolean {
  // Order matters: `---` matches both, and under a line of text it is an
  // underline, so the setext reading has to win.
  return (
    SETEXT_UNDERLINE.test(line) ||
    ATX_HEADING.test(line) ||
    THEMATIC_BREAK.test(line) ||
    QUOTE_LINE.test(line) ||
    PIPE_LINE.test(line)
  );
}
