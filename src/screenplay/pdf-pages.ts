/**
 * The sheets of the PDF as positioned runs of text (slice 2, step 5).
 *
 * **Not a second engine.** The script pages are `layout()`'s lines, the title
 * page is `titlePageRuns`' list, and this file only turns rows and indents into
 * points. A PDF writer given these pages decides nothing about where a line
 * breaks (ADR-0001, ADR-0024); the preview of the title page and the PDF's
 * first page are one function call's result.
 *
 * It is a finished-product export (Q-K): comments and the boneyard are taken
 * out first, the same reduced model the Fountain copy serialises. `(MORE)` and
 * `CHARACTER (CONT'D)` are lines of the layout and so are printed (ADR-0024);
 * the page number is printed from page 2, as the paper draws it.
 *
 * Units are points from the sheet's top-left corner, `y` being the baseline,
 * exactly as `TitlePageRun`.
 */
import type { MarkRange } from "../marks.ts";
import type { ElementType, ScreenplayDocument } from "./document.ts";
import { withoutCommentsAndBoneyard } from "./fountain-copy.ts";
import { CHARACTER_INCHES, DUAL_GEOMETRY, ELEMENT_GEOMETRY, PAGE } from "./geometry.ts";
import { layout, type LayoutLine } from "./layout.ts";
import { titlePageRuns, type TitlePageRun } from "./title-page-layout.ts";

/** Points one character advances. */
const ADVANCE = CHARACTER_INCHES * 72;
const LEFT = PAGE.marginLeftInches * 72;
const TOP_BASELINE = 81;
/** The page number: right-aligned to the right margin, in the top margin. */
const NUMBER_BASELINE = 45;
const NUMBER_RIGHT = 540;

export interface PdfPages {
  /** Page 1 when the title page has anything on it; otherwise empty. */
  readonly titlePage: readonly TitlePageRun[];
  /** One list of runs per numbered page of the layout. */
  readonly pages: readonly (readonly TitlePageRun[])[];
}

const round = (points: number): number => Math.round(points * 100) / 100;

export function pdfPagesOf(document: ScreenplayDocument): PdfPages {
  const reduced = withoutCommentsAndBoneyard(document);
  const laid = layout(reduced);
  const pages = laid.pages.map((page) => {
    const runs: TitlePageRun[] = [];
    if (page.number > 1) {
      const text = `${page.number}.`;
      runs.push(run(text, NUMBER_RIGHT - text.length * ADVANCE, NUMBER_BASELINE, false, false, false));
    }
    for (const line of page.lines) runs.push(...lineRuns(reduced, line));
    return runs;
  });
  return { titlePage: titlePageRuns(reduced.titlePage), pages };
}

function run(
  text: string,
  x: number,
  y: number,
  bold: boolean,
  italic: boolean,
  underline: boolean,
): TitlePageRun {
  return { text, x: round(x), y: round(y), bold, italic, underline };
}

function lineRuns(document: ScreenplayDocument, line: LayoutLine): TitlePageRun[] {
  if (line.text === "") return [];
  // (MORE) and CHARACTER (CONT'D) sit at the cue's indent, like the paper's.
  const type = line.kind === "text" ? document.elements[line.elementIndex]!.type : "character";
  const left = LEFT + startCharacters(type, line) * ADVANCE;
  const baseline = TOP_BASELINE + line.row * PAGE.leadingPoints;
  return split(line.text, line.marks ?? []).map((part) =>
    run(part.text, left + part.offset * ADVANCE, baseline, part.bold, part.italic, part.underline),
  );
}

/**
 * Characters from the left margin to where the line's first character is set:
 * the paper's own rule (`editor.css`), read from the same tables. A right-aligned
 * line (a transition) ends at its box's edge, 7.1in; a cue in a dual column is
 * centred across the column, whose start is `DUAL_GEOMETRY`'s.
 */
function startCharacters(type: ElementType, line: LayoutLine): number {
  const length = line.text.length;
  if (line.column !== "full") {
    const start = DUAL_GEOMETRY.columnStart[line.column];
    if (type === "character") return start + Math.max((DUAL_GEOMETRY.columnWidth - length) / 2, 0);
    return start + DUAL_GEOMETRY.speech[type as keyof typeof DUAL_GEOMETRY.speech].indent;
  }
  const measure = ELEMENT_GEOMETRY[type];
  const slack = measure.width - length;
  if (measure.alignment === "right") return measure.indent + slack;
  if (measure.alignment === "centre") return measure.indent + Math.max(slack / 2, 0);
  return measure.indent;
}

function split(text: string, marks: readonly MarkRange[]) {
  const edges = new Set([0, text.length]);
  for (const range of marks) {
    edges.add(Math.min(Math.max(range.start, 0), text.length));
    edges.add(Math.min(Math.max(range.end, 0), text.length));
  }
  const cuts = [...edges].sort((a, b) => a - b);
  const parts = [];
  for (let at = 0; at + 1 < cuts.length; at++) {
    const start = cuts[at]!;
    const end = cuts[at + 1]!;
    const covered = (mark: string): boolean =>
      marks.some((range) => range.mark === mark && range.start <= start && range.end >= end);
    parts.push({
      text: text.slice(start, end),
      offset: start,
      bold: covered("bold"),
      italic: covered("italic"),
      underline: covered("underline"),
    });
  }
  return parts;
}
