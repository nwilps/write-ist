/**
 * The paper's x positions against the numbers the PDFs measure.
 *
 * Every value below is a pen position read off a PDF — `pdftotext -bbox` for
 * Fountain's *Brick & Steel* (fountain.io, `Brick-&-Steel.pdf`) and the content
 * streams' `Tm` matrices for Final Draft's *Big Fish* — not something derived
 * from the table under test. The table places an element at
 * `marginLeft + indent x CHARACTER_POINTS`, and this says where the PDF put it.
 */
import { describe, expect, it } from "vitest";
import {
  CHARACTER_POINTS,
  DUAL_GEOMETRY,
  ELEMENT_GEOMETRY,
  PAGE,
  type ElementMeasure,
} from "../../src/screenplay/geometry.ts";

const MARGIN = PAGE.marginLeftInches * 72;

/** Points from the sheet's left edge to a position `characters` in from the margin. */
const at = (characters: number): number => MARGIN + characters * CHARACTER_POINTS;

/** Where a line of `length` characters starts on the sheet, as the paper sets it. */
function startOf(measure: ElementMeasure, length: number): number {
  const left = at(measure.indent);
  const room = measure.width;
  if (measure.alignment === "right") return left + (room - length) * CHARACTER_POINTS;
  if (measure.alignment === "centre") return left + ((room - length) / 2) * CHARACTER_POINTS;
  return left;
}

describe("the character grid is the PDFs'", () => {
  it("advances 7pt a character, not Courier's 7.2", () => {
    // Brick & Steel: `SMASH` at 420.000, `CUT` at 461.904, `TO:` at 489.840 —
    // `TO:` is ten characters after `SMASH`. Every run sets Tc = -0.018 at 12pt.
    expect((489.84 - 420) / 10).toBeCloseTo(CHARACTER_POINTS, 1);
    // `smash-and-grab.`, 15 characters, spans 108.000 to 213.144.
    expect((213.144 - 108) / 15).toBeCloseTo(CHARACTER_POINTS, 1);
    expect(CHARACTER_POINTS).not.toBeCloseTo(PAGE.fontSizePoints * 0.6, 1);
  });

  it("sets 61 characters inside the 7.5in margin", () => {
    expect(at(PAGE.measureCharacters)).toBeLessThan(540);
    expect(at(PAGE.rightMarginCharacters)).toBeCloseTo(540, 6);
  });
});

describe("single-column elements start where the PDFs put them", () => {
  // Brick & Steel and Big Fish agree on action and scene headings.
  it.each([
    ["action", 108],
    ["scene-heading", 108],
  ] as const)("%s at x = %dpt", (type, x) => {
    expect(startOf(ELEMENT_GEOMETRY[type], 20)).toBeCloseTo(x, 6);
  });

  // Big Fish's own template (Brick & Steel's stock one sits 9pt further in for
  // a cue and for dialogue: 252pt and 180pt).
  it.each([
    ["character", 243],
    ["dialogue", 171],
    ["parenthetical", 200],
  ] as const)("%s at x = %dpt (Big Fish)", (type, x) => {
    expect(startOf(ELEMENT_GEOMETRY[type], 10)).toBeCloseTo(x, 0);
  });

  // Brick & Steel: right-aligned to 511.2pt, so the start depends on length.
  it.each([
    ["SMASH CUT TO:", 420],
    ["CUT TO:", 462],
  ])("transition %s starts at x = %dpt", (text, x) => {
    expect(startOf(ELEMENT_GEOMETRY.transition, text.length)).toBeCloseTo(x, 0);
  });

  it("ends every transition at the same edge, 511.2pt", () => {
    for (const length of [7, 9, 12, 13]) {
      const start = startOf(ELEMENT_GEOMETRY.transition, length);
      expect(start + length * CHARACTER_POINTS).toBeCloseTo(511.2, 6);
    }
  });
});

describe("dual dialogue starts where Brick & Steel puts it", () => {
  const { columnStart, columnWidth } = DUAL_GEOMETRY;

  it("starts the left column at 108pt and the right at 333pt", () => {
    expect(at(columnStart.left)).toBeCloseTo(108, 6);
    expect(at(columnStart.right)).toBeCloseTo(333, 6);
  });

  it("centres STEEL on 211.5pt and BRICK on 436.5pt", () => {
    const centre = (column: number): number => at(column) + (columnWidth * CHARACTER_POINTS) / 2;
    expect(centre(columnStart.left)).toBeCloseTo(211.5, 6);
    expect(centre(columnStart.right)).toBeCloseTo(436.5, 6);
    // STEEL spans 194.0-229.0 and BRICK 419.0-454.0: five characters each.
    expect(centre(columnStart.left) - (5 * CHARACTER_POINTS) / 2).toBeCloseTo(194, 0);
    expect(centre(columnStart.right) - (5 * CHARACTER_POINTS) / 2).toBeCloseTo(419, 0);
  });

  it("ends 'Screw retirement.' at 227pt and 452pt, under the transition", () => {
    const length = "Screw retirement.".length;
    expect(at(columnStart.left + length)).toBeCloseTo(227, 0);
    expect(at(columnStart.right + length)).toBeCloseTo(452, 0);
    // ...and the right column ends at the 7.5in margin.
    expect(at(columnStart.right + columnWidth)).toBeCloseTo(540, 6);
  });
});
