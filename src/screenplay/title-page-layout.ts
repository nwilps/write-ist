/**
 * The title page laid out on a sheet (slice 2, step 6): the fields in, a list
 * of positioned runs of text out.
 *
 * **One function, so there is one drawing.** The preview draws these runs; the
 * PDF's first page (step 5) prints the same list, and nothing re-derives a
 * placement from the fields. The placements are `TITLE_PAGE_GEOMETRY`'s, which
 * were measured from Final Draft's PDF (#62); Courier Prime is monospaced, so
 * where a run starts is exact arithmetic on the advance, not a measurement of
 * rendered text.
 *
 * Units are points from the sheet's top-left corner, `y` being the baseline.
 * A key the table has no row for is stacked at the top of the page, one line
 * under another, as #62 left it.
 */
import type { MarkedValue, TitlePageField } from "./document.ts";
import { CHARACTER_INCHES, PAGE, TITLE_PAGE_GEOMETRY } from "./geometry.ts";

export interface TitlePageRun {
  readonly text: string;
  /** Points from the sheet's left edge to the run's left edge. */
  readonly x: number;
  /** Points from the sheet's top edge to the run's baseline. */
  readonly y: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
}

export const SHEET_POINTS = { width: PAGE.widthInches * 72, height: PAGE.heightInches * 72 } as const;

/** Points one character advances. */
const ADVANCE = CHARACTER_INCHES * 72;

/** Where unplaced keys start: the first body baseline of a script page. */
const TOP_BASELINE = 81;

const round = (points: number): number => Math.round(points * 100) / 100;

/** One line of a value: its text with the leading space dropped, split where its marks change. */
function segments(value: MarkedValue): { text: string; offset: number; bold: boolean; italic: boolean; underline: boolean }[] {
  const lead = value.text.length - value.text.trimStart().length;
  const text = value.text.slice(lead).trimEnd();
  if (text === "") return [];
  const marks = (value.marks ?? []).map((range) => ({ ...range, start: range.start - lead, end: range.end - lead }));
  const edges = new Set([0, text.length]);
  for (const range of marks) {
    edges.add(Math.min(Math.max(range.start, 0), text.length));
    edges.add(Math.min(Math.max(range.end, 0), text.length));
  }
  const cuts = [...edges].sort((a, b) => a - b);
  const found = [];
  for (let at = 0; at + 1 < cuts.length; at++) {
    const start = cuts[at]!;
    const end = cuts[at + 1]!;
    const covered = (mark: string): boolean =>
      marks.some((range) => range.mark === mark && range.start <= start && range.end >= end);
    found.push({
      text: text.slice(start, end),
      offset: start,
      bold: covered("bold"),
      italic: covered("italic"),
      underline: covered("underline"),
    });
  }
  return found;
}

/** The runs of a title page, in the order the fields are written. */
export function titlePageRuns(titlePage: readonly TitlePageField[]): readonly TitlePageRun[] {
  const runs: TitlePageRun[] = [];
  let unplaced = 0;
  for (const field of titlePage) {
    const placement = Object.entries(TITLE_PAGE_GEOMETRY).find(
      ([key]) => key.toLowerCase() === field.key.trim().toLowerCase(),
    )?.[1];
    const lines = [field.inline, ...field.continuations].map(segments).filter((line) => line.length > 0);
    lines.forEach((line, at) => {
      const characters = line.reduce((n, part) => Math.max(n, part.offset + part.text.length), 0);
      const width = characters * ADVANCE;
      let left: number;
      let baseline: number;
      if (placement === undefined) {
        left = PAGE.marginLeftInches * 72;
        baseline = TOP_BASELINE + unplaced++ * PAGE.leadingPoints;
      } else {
        baseline = placement.yPoints + at * PAGE.leadingPoints;
        left =
          placement.alignment === "centre"
            ? SHEET_POINTS.width / 2 - width / 2
            : placement.alignment === "right"
              ? placement.xInches * 72 - width
              : placement.xInches * 72;
      }
      for (const part of line) {
        runs.push({
          text: part.text,
          x: round(left + part.offset * ADVANCE),
          y: round(baseline),
          bold: part.bold,
          italic: part.italic,
          underline: part.underline,
        });
      }
    });
  }
  return runs;
}
