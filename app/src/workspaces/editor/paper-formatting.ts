/**
 * A project's own formatting (`src/screenplay/formatting.ts`) as the paper's
 * stylesheet reads it: attributes on the manuscript, which `editor.css` draws
 * by. Only what differs from the paper's own look is said, so a project that
 * never chose carries none of them.
 *
 * Bold scene headings has no attribute: the paper always draws headings bold
 * (`editor.css`), and the choice is the PDF's.
 */
import type { Formatting } from "../../../../src/screenplay/formatting.ts";

export function formattingAttributes(formatting: Formatting): Record<string, string> {
  return {
    ...(formatting.boldTransitions ? { "data-bold-transitions": "" } : {}),
    ...(formatting.blankLinesBeforeSceneHeadings === 1 ? { "data-scene-heading-gap": "1" } : {}),
  };
}
