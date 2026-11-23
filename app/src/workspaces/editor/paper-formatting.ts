/**
 * A project's own formatting (`src/screenplay/formatting.ts`) as the paper's
 * stylesheet reads it: attributes on the manuscript, which `editor.css` draws
 * by. Only what differs from the paper's own look is said — headings bold,
 * transitions regular, two blank lines before a heading — so a project that
 * never chose carries none of them.
 *
 * The bold choices are the paper's only; the PDF's are made in Export As.
 */
import type { Formatting } from "../../../../src/screenplay/formatting.ts";

export function formattingAttributes(formatting: Formatting): Record<string, string> {
  return {
    ...(formatting.boldSceneHeadings ? {} : { "data-regular-scene-headings": "" }),
    ...(formatting.boldTransitions ? { "data-bold-transitions": "" } : {}),
    ...(formatting.blankLinesBeforeSceneHeadings === 1 ? { "data-scene-heading-gap": "1" } : {}),
  };
}
