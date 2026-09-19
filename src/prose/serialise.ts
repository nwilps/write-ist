/**
 * Writing the prose element sequence back out as Markdown.
 *
 * Every element is written the way it was read. Markdown spells one element
 * several ways and the spelling carries no meaning, which makes it exactly the
 * kind of thing an unwary serialiser canonicalises — turning `* * *` into
 * `---` throughout a novel, changing nothing a reader sees and every byte on
 * disk. ADR-0020 does not permit that, so the element remembers.
 */
import { commentInserts, PROSE_COMMENTS } from "../comments.ts";
import type { ProseDocument, ProseElement } from "./document.ts";
import { renderMarks } from "./marks.ts";

export function serialise(document: ProseDocument): string {
  const lines: string[] = [];
  // Each comment written once, across wrapped lines or paragraphs if that is
  // what it covers (ADR-0018).
  const inserts = commentInserts(document.comments, PROSE_COMMENTS);
  let previous: ProseElement | undefined;

  document.elements.forEach((element, index) => {
    if (previous !== undefined && needsBlankLine(previous, element)) lines.push("");
    lines.push(render(element, inserts.get(index)));
    previous = element;
  });

  return lines.join("\n") + (document.endsWithNewline ? "\n" : "");
}

/**
 * Where a blank line falls between two elements.
 *
 * This is a stronger obligation than the screenplay surface's spacing table.
 * There a blank line is a convention; here it is Markdown syntax, and two
 * paragraphs run together are one paragraph. Every pair this parser can
 * currently produce takes a blank line — a heading, a scene break and a
 * paragraph all end their block.
 */
function needsBlankLine(previous: ProseElement, next: ProseElement): boolean {
  // A cut delimiter sits against the material it delimits, exactly as a
  // boneyard delimiter does on the screenplay surface. The blank lines that
  // separate a cut from the prose around it are outside the pair.
  if (previous.type === "cut-start") return false;
  if (next.type === "cut-end") return false;

  // Every other pair, including two quotes or two line blocks in a row. A
  // quote is one element holding all its lines, so the only place two of them
  // meet is a real block boundary — which in Markdown *is* the blank line.
  // Omitting it there would merge two quotes into one.
  return true;
}

/**
 * The element's lines, which for a paragraph is more than one.
 *
 * Marks go back before the block markers do. A `>` or `|` belongs to the line,
 * and a mark belongs to the text — so a mark that crosses a wrap inside a
 * quote is written once, around the whole run, and each line still gets its
 * own marker. Comment delimiters go in with the marks, so they too sit inside
 * a quote's markers and after a heading's hashes.
 */
function render(element: ProseElement, comments?: ReadonlyMap<number, string>): string {
  const text = renderMarks(element, comments);
  switch (element.type) {
    case "heading":
      // Setext if the source was setext, ATX if it was ATX. Never converted.
      return element.underline === undefined
        ? `${"#".repeat(element.level ?? 1)} ${text}`
        : `${text}\n${element.underline}`;
    // One element, all its lines. An empty line inside the block is written
    // with the bare marker, which is how Markdown spells it and what the
    // parser read it from.
    case "block-quote":
      return marked(text, ">");
    case "verse":
      return marked(text, "|");
    case "paragraph":
    case "scene-break":
    case "footnote":
    case "cut-start":
    case "cut-end":
    // A passthrough is an exact copy of its own text, newlines and all.
    case "passthrough":
      return text;
  }
}

/** Put a block's marker back on each of its lines. */
function marked(text: string, marker: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? marker : `${marker} ${line}`))
    .join("\n");
}
