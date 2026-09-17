/**
 * Writing the prose element sequence back out as Markdown.
 *
 * Every element is written the way it was read. Markdown spells one element
 * several ways and the spelling carries no meaning, which makes it exactly the
 * kind of thing an unwary serialiser canonicalises — turning `* * *` into
 * `---` throughout a novel, changing nothing a reader sees and every byte on
 * disk. ADR-0020 does not permit that, so the element remembers.
 */
import type { ProseDocument, ProseElement } from "./document.ts";

export function serialise(document: ProseDocument): string {
  const lines: string[] = [];
  let previous: ProseElement | undefined;

  for (const element of document.elements) {
    if (previous !== undefined && needsBlankLine(previous, element)) lines.push("");
    lines.push(render(element));
    previous = element;
  }

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
  // A line block and a block quote are runs of lines, and a blank line in the
  // middle of one does not space it out — it ends it, and starts another.
  if (previous.type === "verse" && next.type === "verse") return false;
  if (previous.type === "block-quote" && next.type === "block-quote") return false;
  return true;
}

/** The element's lines, which for a paragraph is more than one. */
function render(element: ProseElement): string {
  switch (element.type) {
    case "heading":
      // Setext if the source was setext, ATX if it was ATX. Never converted.
      return element.underline === undefined
        ? `${"#".repeat(element.level ?? 1)} ${element.text}`
        : `${element.text}\n${element.underline}`;
    case "block-quote":
    case "verse":
      return `${element.marker ?? ""}${element.text}`;
    case "paragraph":
    case "scene-break":
    // A passthrough is an exact copy of its own text, newlines and all.
    case "passthrough":
      return element.text;
  }
}
