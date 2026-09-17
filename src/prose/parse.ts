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

/**
 * A block-quote line: `> ` and its content, or `>` alone, which is how a blank
 * line inside a quote is spelled.
 *
 * Strict on purpose. A quote written `>text` with no space is not matched and
 * stays a paragraph, because accepting it would mean writing back `> text` and
 * adding a byte the writer did not type.
 */
const QUOTE_LINE = /^>(?: (.*))?$/;

/** A line block line — Pandoc's verse — read on the same terms. */
const VERSE_LINE = /^\|(?: (.*))?$/;

/** Any line beginning with a pipe, which is verse or a pipe table. */
const PIPE_START = /^\|/;

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

/**
 * The cut delimiters — prose's counterpart to the screenplay boneyard.
 *
 * Delimiters with an `omitted` flag on the elements between, never a
 * container, and carrying no id (ADR-0021, ADR-0022).
 */
const CUT_OPEN = "<!--cut-->";
const CUT_CLOSE = "<!--/cut-->";

/**
 * A footnote definition. ADR-0023 keeps the syntax in the subset even though
 * the authoring feature is deferred, so that a file carrying one round-trips
 * and is never destroyed.
 */
const FOOTNOTE_DEFINITION = /^\[\^[^\]]+\]:/;

/** A line that opens an HTML comment. */
const COMMENT_OPEN = "<!--";
const COMMENT_CLOSE = "-->";

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

    if (line === CUT_OPEN && closesLater(lines, index)) {
      elements.push({ type: "cut-start", text: line });
      index++;
      continue;
    }
    if (line === CUT_CLOSE) {
      elements.push({ type: "cut-end", text: line });
      index++;
      continue;
    }

    const atx = ATX_HEADING.exec(line);
    if (atx !== null) {
      elements.push({ type: "heading", text: atx[2]!, level: atx[1]!.length });
      index++;
      continue;
    }

    if (line.startsWith(COMMENT_OPEN)) {
      const block = readCommentBlock(lines, index);
      if (block !== null) {
        elements.push({ type: "passthrough", text: block.text });
        index = block.next;
        continue;
      }
    }

    if (FOOTNOTE_DEFINITION.test(line)) {
      const end = runEnd(lines, index);
      elements.push({ type: "footnote", text: lines.slice(index, end).join("\n") });
      index = end;
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
      const block = readMarkedBlock(lines, index, "block-quote", QUOTE_LINE);
      if (block !== null) {
        elements.push(block.element);
        index = block.next;
        continue;
      }
    }

    if (PIPE_START.test(line)) {
      const next = readPipeRun(lines, index, elements);
      if (next !== null) {
        index = next;
        continue;
      }
    }

    index = readTextBlock(lines, index, elements);
  }

  return { elements: markOmitted(elements), endsWithNewline };
}

/**
 * Mark everything between a pair of cut delimiters as omitted.
 *
 * A second pass rather than a flag threaded through the parse, because the cut
 * is a *range* over the sequence and nothing about reading an element depends
 * on being inside one. The delimiters carry the flag too, so stripping a cut
 * is a single filter.
 */
function markOmitted(elements: readonly ProseElement[]): ProseElement[] {
  let inside = false;
  return elements.map((element) => {
    if (element.type === "cut-start") inside = true;
    const marked = inside ? { ...element, omitted: true } : element;
    if (element.type === "cut-end") inside = false;
    return marked;
  });
}

/** Where a run of consecutive non-blank lines ends. */
function runEnd(lines: readonly string[], start: number): number {
  let end = start + 1;
  while (end < lines.length && lines[end] !== "" && !interrupts(lines[end]!)) end++;
  return end;
}

/** Whether a later line closes this cut, as on the screenplay surface. */
function closesLater(lines: readonly string[], from: number): boolean {
  for (let index = from + 1; index < lines.length; index++) {
    if (lines[index] === CUT_CLOSE) return true;
  }
  return false;
}

/**
 * An HTML comment standing alone as a block, which is a passthrough.
 *
 * ADR-0023 draws the line: an HTML comment carrying our id prefix is a
 * Write-ist comment, and everything else is a passthrough. In practice the
 * test is whether anything follows the comment — `<!--c:a1 …-->She left.` is a
 * paragraph with a comment in it, and a comment with a blank line after it is
 * a block of its own.
 *
 * "Anything" includes the next line. A comment followed straight away by prose
 * is part of that run: calling it a block would put a blank line between them
 * on the way out, and that blank line was not in the writer's file.
 *
 * Returns null in either case, so the run falls through and becomes a
 * paragraph, which is lossless.
 */
function readCommentBlock(
  lines: readonly string[],
  start: number,
): { text: string; next: number } | null {
  for (let index = start; index < lines.length && lines[index] !== ""; index++) {
    const closes = lines[index]!.indexOf(COMMENT_CLOSE);
    if (closes === -1) continue;
    // Anything after the first `-->` means this is prose with a comment in it.
    if (closes + COMMENT_CLOSE.length !== lines[index]!.length) return null;
    const after = lines[index + 1];
    if (after !== undefined && after !== "") return null;
    return { text: lines.slice(start, index + 1).join("\n"), next: index + 1 };
  }
  return null;
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
 * A run of consecutive marked lines, as **one** element.
 *
 * The blank line is the boundary. Two quotes with a blank line between them
 * are two blocks and two elements; two quote lines with no blank between them
 * are one block and merge into one element. That is what makes the spacing
 * rule work out: within an element the lines simply are what they are, and
 * between two elements the ordinary blank line applies, so neither can
 * swallow the other.
 *
 * The element's text is the content with the markers taken off, joined by the
 * newlines that were already there. Returns null if any line in the run is
 * spelled some other way, in which case the run is left to be a paragraph and
 * every byte of it survives untouched.
 */
function readMarkedBlock(
  lines: readonly string[],
  start: number,
  type: "block-quote" | "verse",
  pattern: RegExp,
): { element: ProseElement; next: number } | null {
  const content: string[] = [];
  let index = start;

  while (index < lines.length && lines[index] !== "") {
    const match = pattern.exec(lines[index]!);
    if (match === null) break;
    // A bare `>` has no capture group: it is an empty line inside the block.
    content.push(match[1] ?? "");
    index++;
  }

  // The run ended because a line was spelled differently, not because the
  // block ended. Reading part of it would split a block that is not split.
  if (index < lines.length && lines[index] !== "" && startsWith(lines[index]!, pattern)) {
    return null;
  }
  if (content.length === 0) return null;

  return { element: { type, text: content.join("\n") }, next: index };
}

/** Whether the line opens with this construct's marker but is spelled oddly. */
function startsWith(line: string, pattern: RegExp): boolean {
  return pattern === QUOTE_LINE ? line.startsWith(">") : line.startsWith("|");
}

/**
 * A run of lines beginning with `|`: a pipe table if its second line is a
 * delimiter row, otherwise Pandoc's line block, which is verse.
 */
function readPipeRun(
  lines: readonly string[],
  start: number,
  elements: ProseElement[],
): number | null {
  const second = lines[start + 1];
  if (second !== undefined && TABLE_DELIMITER.test(second)) {
    let end = start;
    while (end < lines.length && PIPE_START.test(lines[end]!)) end++;
    elements.push({ type: "passthrough", text: lines.slice(start, end).join("\n") });
    return end;
  }

  const block = readMarkedBlock(lines, start, "verse", VERSE_LINE);
  if (block === null) return null;
  elements.push(block.element);
  return block.next;
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
    PIPE_START.test(line) ||
    line === CUT_OPEN ||
    line === CUT_CLOSE
  );
}
