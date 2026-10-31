/**
 * Find in the manuscript: the visible text, nothing else (the desk design,
 * §2.5; ADR-0018).
 *
 * It reads the editor's document, whose element text is already what the writer
 * sees — forcing markers, mark delimiters and comment delimiters are attributes
 * there, never characters (`schema.ts`) — so a query for `**` or `[[` finds
 * nothing the page does not show. The title page is not searched: it is not on
 * the paper.
 *
 * **Not on the keystroke path.** It runs when the writer types in the search
 * field, over a document that is not changing, and walks each element once.
 * Each match carries the *manuscript* element index (blank lines omitted, the
 * numbering `pageOfElement` uses), counted in the same walk, so asking which
 * page a match is on never means a second walk per match.
 */
import type { Node as EditorNode } from "prosemirror-model";

/** One place the query was found. */
export interface Match {
  /** Document position of the first character matched — where a jump lands. */
  readonly from: number;
  /** Document position just past the last. */
  readonly to: number;
  /** The element's whole text, for showing the match in its line. */
  readonly text: string;
  /** Where in `text` the match starts. */
  readonly offset: number;
  /** How many characters it covers. */
  readonly length: number;
  /** Among manuscript elements, blank lines omitted (`manuscriptElementAt`). */
  readonly manuscriptElement: number;
}

/** More than this is a scroll, not a list; the count still says how many. */
export const SHOWN = 200;

export interface Found {
  /** Every match, in reading order. */
  readonly total: number;
  /** The first `SHOWN` of them. */
  readonly matches: readonly Match[];
}

/**
 * Every occurrence of `query`, ignoring case, in reading order. An empty query
 * finds nothing. Occurrences within an element do not overlap.
 */
export function findInManuscript(doc: EditorNode, query: string): Found {
  const needle = query.toLowerCase();
  const matches: Match[] = [];
  let total = 0;
  if (needle === "") return { total, matches };

  let manuscript = 0;
  doc.forEach((child, start) => {
    if (child.type.name !== "element") return;
    const text = child.textContent;
    // A blank line is spacing, not a manuscript element (ADR-0019).
    if (text === "") return;
    const index = manuscript;
    manuscript += 1;

    const hay = text.toLowerCase();
    // Lower-casing can change a string's length (İ), and an offset into the
    // lowered text would then point at the wrong character.
    if (hay.length !== text.length) return;
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
      total += 1;
      if (matches.length < SHOWN) {
        matches.push({
          from: start + 1 + at,
          to: start + 1 + at + needle.length,
          text,
          offset: at,
          length: needle.length,
          manuscriptElement: index,
        });
      }
    }
  });
  return { total, matches };
}
