/**
 * Writing the flat element sequence back out as Fountain.
 *
 * Blank lines are not stored (ADR-0019), so every one of them is recomputed
 * here from the pair of element types either side of it. That is the whole of
 * the spacing model, and it is what makes ADR-0020's claim — spacing is
 * derived from adjacent element types — actually true.
 */
import { commentInserts, SCREENPLAY_COMMENTS } from "../comments.ts";
import type { Element, ScreenplayDocument } from "./document.ts";
import { renderMarks } from "./marks.ts";

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
    lines.push(`${field.key}:${renderMarks(field.inline)}`);
    lines.push(...field.continuations.map((line) => renderMarks(line)));
  }
  if (document.titlePage.length > 0 && document.elements.length > 0) lines.push("");

  // Each comment is written once, its opener in the element it starts in and
  // its closer in the element it ends in, across lines if need be (ADR-0018).
  const inserts = commentInserts(document.comments, SCREENPLAY_COMMENTS);

  let previous: Element | undefined;
  document.elements.forEach((element, index) => {
    if (previous !== undefined && needsBlankLine(previous, element)) lines.push("");
    lines.push(element.indent + renderContent(element, inserts.get(index)));
    previous = element;
  });

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
  // A boneyard delimiter sits against what it delimits. The blank lines that
  // separate the boneyard from the script around it are the ones *outside*
  // the pair, and those follow the ordinary rule.
  if (previous.type === "boneyard-start") return false;
  if (next.type === "boneyard-end") return false;
  return true;
}

/**
 * The element's line, without its indentation.
 *
 * Marks go back first, then the forcing marker in front of the result — a
 * forced heading is `.` followed by the heading *as the writer sees it*, so
 * `.**INT. HOSPITAL - DAY**` is a dot, a bold mark and a heading, in that
 * order, and never a dot inside the bold.
 *
 * Comment delimiters go in with the marks, outside any mark that begins or
 * ends at the same character, and so inside the forcing marker too:
 * `.[[c:a1 remark]]INT. KITCHEN - DAY[[/c:a1]]` (ADR-0018).
 */
function renderContent(element: Element, comments?: ReadonlyMap<number, string>): string {
  const text = renderMarks(element, comments);
  switch (element.type) {
    case "scene-heading": {
      const heading = element.forced ? `.${text}` : text;
      // A scene number is only ever lifted out of a heading that wrote it with
      // one space, so one space is what goes back (ADR-0021).
      return element.sceneNumber === undefined ? heading : `${heading} #${element.sceneNumber}#`;
    }
    case "action":
      return element.forced ? `!${text}` : text;
    case "character": {
      const cue = element.forced ? `@${text}` : text;
      return element.dual === true ? `${cue} ^` : cue;
    }
    case "transition":
      return element.forced ? `>${text}` : text;
    case "centered":
      return `>${text}<`;
    case "lyrics":
      return `~${text}`;
    case "section":
      return `${"#".repeat(element.depth ?? 1)}${text}`;
    case "synopsis":
      return `=${text}`;
    case "dialogue":
    case "parenthetical":
    case "page-break":
    case "note":
    case "boneyard-start":
    case "boneyard-end":
      return text;
  }
}
