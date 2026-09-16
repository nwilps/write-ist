/**
 * Writing the flat element sequence back out as Fountain.
 *
 * Blank lines are not stored (ADR-0019), so every one of them is recomputed
 * here from the pair of element types either side of it. That is the whole of
 * the spacing model, and it is what makes ADR-0020's claim — spacing is
 * derived from adjacent element types — actually true.
 */
import type { Element, ScreenplayDocument } from "./document.ts";

/** Types that open or continue a speech: a cue and what may follow it. */
const OPENS_SPEECH: ReadonlySet<Element["type"]> = new Set([
  "character",
  "parenthetical",
  "dialogue",
]);

/** Types that may continue a speech already in progress. */
const CONTINUES_SPEECH: ReadonlySet<Element["type"]> = new Set(["parenthetical", "dialogue"]);

export function serialise(document: ScreenplayDocument): string {
  const lines: string[] = [];

  for (const field of document.titlePage) {
    lines.push(`${field.key}:${field.inline}`);
    lines.push(...field.continuations);
  }
  if (document.titlePage.length > 0 && document.elements.length > 0) lines.push("");

  let previous: Element | undefined;
  for (const element of document.elements) {
    if (previous !== undefined && needsBlankLine(previous, element)) lines.push("");
    lines.push(element.indent + renderContent(element));
    previous = element;
  }

  return lines.join("\n") + (document.endsWithNewline ? "\n" : "");
}

/**
 * ADR-0019's spacing table, plus the row it does not state.
 *
 * The table reads: Action to Action yes; Dialogue to Dialogue, Centered to
 * Centered and Lyrics to Lyrics no; everything else yes. Taken literally,
 * "everything else" puts a blank line between a character cue and its own
 * dialogue — which in Fountain ends the speech, turning the cue into an action
 * line. The rule the format actually requires is that no blank line falls
 * anywhere inside a speech, and Dialogue to Dialogue is one case of it.
 */
function needsBlankLine(previous: Element, next: Element): boolean {
  if (OPENS_SPEECH.has(previous.type) && CONTINUES_SPEECH.has(next.type)) return false;
  if (previous.type === "centered" && next.type === "centered") return false;
  if (previous.type === "lyrics" && next.type === "lyrics") return false;
  return true;
}

/** The element's line, without its indentation. */
function renderContent(element: Element): string {
  switch (element.type) {
    case "scene-heading": {
      const heading = element.forced ? `.${element.text}` : element.text;
      // A scene number is only ever lifted out of a heading that wrote it with
      // one space, so one space is what goes back (ADR-0021).
      return element.sceneNumber === undefined ? heading : `${heading} #${element.sceneNumber}#`;
    }
    case "action":
      return element.forced ? `!${element.text}` : element.text;
    case "character": {
      const cue = element.forced ? `@${element.text}` : element.text;
      return element.dual === true ? `${cue} ^` : cue;
    }
    case "transition":
      return element.forced ? `>${element.text}` : element.text;
    case "centered":
      return `>${element.text}<`;
    case "lyrics":
      return `~${element.text}`;
    case "section":
      return `${"#".repeat(element.depth ?? 1)}${element.text}`;
    case "synopsis":
      return `=${element.text}`;
    case "dialogue":
    case "parenthetical":
    case "page-break":
    case "note":
    // A boneyard's text carries its own newlines, and each line after the
    // first carries its own indentation.
    case "boneyard":
      return element.text;
  }
}
