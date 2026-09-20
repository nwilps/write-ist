/**
 * **The industry layout, checked against what Final Draft actually printed**
 * (#40).
 *
 * The acceptance criterion is *"checked by eye against Final Draft's PDF of
 * Big Fish"*, and the eye is the writer's — seam 4. What is checkable without a
 * window is everything the eye cannot do: that the numbers in
 * `src/screenplay/geometry.ts` are the ones measured from that PDF, that the
 * stylesheet the page reads is that same table and not a second copy of it, and
 * that the four weights of the face those numbers are defined against are in
 * the bundle rather than on somebody's machine.
 *
 * ## Where the expected values come from
 *
 * `docs/adr/0001` pins pagination to Courier Prime at 12pt; the PDF says what
 * that looks like. It was measured on 2026-09-20 by decompressing all 122 pages
 * and reading each text run's `Tm` matrix — the pen position and font size as
 * Final Draft wrote them, not an extractor's guess at an ink bounding box. The
 * numbers below are those measurements. **If one of them disagrees with the
 * code, say which and why; do not edit it to match** (`docs/STANDARDS.md`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_INCHES,
  ELEMENT_GEOMETRY,
  PAGE,
  bodyHeightInches,
  indentProperty,
  marginRightInches,
  measureProperty,
  stylesheet,
} from "../../src/screenplay/geometry.ts";
import { ELEMENT_TYPES } from "../../src/screenplay/schema.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATED = join(root, "app", "src", "style", "geometry.css");
const EDITOR = join(root, "app", "src", "style", "editor.css");
const FONTS = join(root, "app", "public", "fonts");

/** Points from the sheet's left edge to an element's left edge, as the PDF has it. */
const pointsFromSheetLeft = (indent: number): number =>
  (PAGE.marginLeftInches + indent / 10) * 72;

/**
 * Every x position Final Draft set a line at, and how many lines it set there.
 *
 * Read off the PDF's own content streams. Four positions carry 4,283 of the
 * 4,668 text runs between them, and they are the four elements that have an
 * indent at all.
 */
const MEASURED_X_POINTS: ReadonlyArray<readonly [string, number, number]> = [
  ["scene-heading", 108, 1882],
  ["action", 108, 1882],
  ["character", 243, 784],
  ["dialogue", 171, 1720],
  ["parenthetical", 200, 97],
];

describe("the industry layout is what Final Draft printed (#40)", () => {
  for (const [type, x, lines] of MEASURED_X_POINTS) {
    it(`puts ${type} where the PDF puts it: x = ${x}pt, over ${lines} lines`, () => {
      const measure = ELEMENT_GEOMETRY[type as keyof typeof ELEMENT_GEOMETRY];
      expect(pointsFromSheetLeft(measure.indent)).toBeCloseTo(x, 3);
    });
  }

  it("wraps action at 61 characters, not at the 60 the margins imply", () => {
    // 144 action lines in the PDF are exactly 61 characters long; three are 62
    // and all three break after a hyphen; none is 63. Final Draft lays its own
    // text out at about 7.0pt a character rather than Courier's 7.2, so 61 of
    // them fit inside its 7.5in right margin. Write-ist matches the character
    // count, because the character count is what moves a page break.
    expect(ELEMENT_GEOMETRY.action.width).toBe(61);
    expect(ELEMENT_GEOMETRY["scene-heading"].width).toBe(61);
    // And the consequence is written down rather than quietly absorbed.
    expect(marginRightInches()).toBeCloseTo(0.9, 6);
    expect(PAGE.measureCharacters).toBeGreaterThan(PAGE.rightMarginCharacters);
  });

  it("wraps dialogue at 39 characters, not the reference's 35", () => {
    // 202 dialogue lines are exactly 39 characters; two are 40 and both break
    // after a hyphen; none is 41. The spike's 35 is v1's constant, and the PDF
    // disagrees with it.
    expect(ELEMENT_GEOMETRY.dialogue.width).toBe(39);
  });

  it("right-aligns transitions to the 7.5in margin the PDF fixes", () => {
    const transition = ELEMENT_GEOMETRY.transition;
    expect(transition.alignment).toBe("right");
    // Solved from four transitions at four x positions — `CUT TO:` at 491pt
    // with 7 characters against `MATCH CUT TO:` at 449pt with 13 — giving a
    // right edge of 540pt with no remainder on the other two.
    const rightEdgePoints =
      (PAGE.marginLeftInches + (transition.indent + transition.width) / 10) * 72;
    expect(rightEdgePoints).toBeCloseTo(540, 6);
  });

  it("sets the leading to the PDF's 12 points, not the reference's 1.4", () => {
    // The PDF's baselines fall on an exact 12pt grid. At 1.4 the same page
    // would hold 39 lines where Final Draft holds 55, and the page count is
    // what this whole table exists to get right.
    expect(PAGE.leadingPoints).toBe(PAGE.fontSizePoints);
    expect(PAGE.linesPerPage).toBe(55);
    // 55 lines at 12pt, measured from the PDF: baselines run y = 81 to y = 729.
    expect((729 - 81) / 12 + 1).toBe(PAGE.linesPerPage);
  });

  it("spends the whole sheet, both ways", () => {
    // A margin that does not add up is the quiet kind of layout bug: every
    // element looks right and the page is the wrong height.
    expect(
      PAGE.marginLeftInches + PAGE.measureCharacters / 10 + marginRightInches(),
    ).toBeCloseTo(PAGE.widthInches, 6);

    const bottom = PAGE.heightInches - PAGE.marginTopInches - bodyHeightInches();
    expect(bodyHeightInches()).toBeCloseTo(55 / 6, 6);
    expect(bottom).toBeCloseTo(0.8333, 4);
    expect(PAGE.marginTopInches + bodyHeightInches() + bottom).toBeCloseTo(
      PAGE.heightInches,
      6,
    );
  });

  it("gives every element type a place and a reason for it", () => {
    // ADR-0021's whole vocabulary. A type added to the surface without a place
    // on the page would not compile, and this says the same thing at runtime
    // for anyone reading the failure rather than the type error.
    expect(Object.keys(ELEMENT_GEOMETRY).sort()).toEqual([...ELEMENT_TYPES].sort());

    for (const type of ELEMENT_TYPES) {
      const measure = ELEMENT_GEOMETRY[type];
      expect(measure.indent, type).toBeGreaterThanOrEqual(0);
      expect(measure.width, type).toBeGreaterThan(0);
      // Provenance beside the value is the acceptance criterion, not a comment
      // style: "with the source of each value recorded beside it".
      expect(measure.source.length, type).toBeGreaterThan(40);
    }
  });

  it("keeps every element inside the sheet", () => {
    for (const type of ELEMENT_TYPES) {
      const { indent, width } = ELEMENT_GEOMETRY[type];
      const rightInches = PAGE.marginLeftInches + (indent + width) / 10;
      expect(rightInches, type).toBeLessThanOrEqual(PAGE.widthInches);
    }
  });
});

describe("the layout and the page count read one table (#40)", () => {
  it("has the checked-in stylesheet exactly as the table renders it", () => {
    // The page cannot read TypeScript and the engine cannot read CSS, so one
    // is generated from the other. This is what makes the generated half as
    // trustworthy as the table — and what stops someone editing the stylesheet
    // and wondering later why the page count disagrees with the page.
    expect(readFileSync(GENERATED, "utf8")).toBe(stylesheet());
  });

  it("declares an indent and a measure for every element type", () => {
    const css = readFileSync(GENERATED, "utf8");
    for (const type of ELEMENT_TYPES) {
      expect(css, type).toContain(`${indentProperty(type)}:`);
      expect(css, type).toContain(`${measureProperty(type)}:`);
    }
  });

  it("has the Editor lay every element out from those values and no others", () => {
    const css = readFileSync(EDITOR, "utf8");
    for (const type of ELEMENT_TYPES) {
      const rule = new RegExp(
        `\\.manuscript > \\[data-element="${type}"\\]\\s*\\{[^}]*` +
          `margin-left: var\\(${indentProperty(type)}\\);[^}]*` +
          `width: var\\(${measureProperty(type)}\\);`,
      );
      expect(rule.test(css), `${type} is not laid out from the table`).toBe(true);
    }
  });

  it("measures in `ch`, which is the advance width itself", () => {
    // ADR-0024's one uncovered risk: "if the editor column is not an exact
    // whole number of Courier Prime advance widths, three engines can round the
    // fit differently". `ch` is that advance, so the column is an exact
    // multiple of it by construction rather than by arithmetic.
    const css = readFileSync(GENERATED, "utf8");
    for (const type of ELEMENT_TYPES) {
      expect(css).toMatch(new RegExp(`${measureProperty(type)}: [\\d.]+ch;`));
    }
  });

  it("fakes no capitals in CSS", () => {
    // #40's first named trap: a `text-transform` would hide a cue that was
    // never actually capitalised. The comments are stripped first, because the
    // stylesheet quotes the rule while explaining why it holds — and a check
    // that its own subject's name satisfies is not a check.
    const rules = readFileSync(EDITOR, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toContain("text-transform");
    // The rule can still fail: the stripping leaves declarations alone.
    expect(rules).toContain("text-align: right");
  });
});

/** The `head` and `hhea`/`hmtx` numbers a TrueType file carries. */
function metrics(file: string): { unitsPerEm: number; advance: number } {
  const font = readFileSync(join(FONTS, file));
  const tables = new Map<string, number>();
  for (let i = 0; i < font.readUInt16BE(4); i += 1) {
    const at = 12 + 16 * i;
    tables.set(font.toString("ascii", at, at + 4), font.readUInt32BE(at + 8));
  }
  const head = tables.get("head");
  const hmtx = tables.get("hmtx");
  if (head === undefined || hmtx === undefined) throw new Error(`${file} is not a font`);
  return { unitsPerEm: font.readUInt16BE(head + 18), advance: font.readUInt16BE(hmtx) };
}

const WEIGHTS = ["Regular", "Bold", "Italic", "BoldItalic"] as const;

describe("Courier Prime is bundled, not borrowed (ADR-0001, ADR-0030)", () => {
  it("ships all four weights", () => {
    // ADR-0001: pagination is defined against this face's metrics and system
    // Courier varies between operating systems and between versions of one. The
    // writer's own machine has no Courier Prime at all, and fontconfig answers
    // the request with a proportional face.
    const bundled = readdirSync(FONTS).filter((name) => name.startsWith("CourierPrime"));
    expect(bundled.sort()).toEqual(WEIGHTS.map((w) => `CourierPrime-${w}.ttf`).sort());
  });

  it("declares each weight to the page", () => {
    const tokens = readFileSync(join(root, "app", "src", "style", "tokens.css"), "utf8");
    for (const weight of WEIGHTS) {
      expect(tokens).toContain(`/fonts/CourierPrime-${weight}.ttf`);
    }
    expect(tokens).toContain('font-family: "Courier Prime"');
  });

  it("carries its licence, beside the other face's", () => {
    // Both faces are OFL, which is the test ADR-0001 applied to bundling one at
    // all. Two files rather than one, because they are two licences to two
    // different copyright holders.
    const licences = readdirSync(FONTS).filter((name) => name.startsWith("OFL"));
    expect(licences.sort()).toEqual(["OFL-CourierPrime.txt", "OFL-JetBrainsMono.txt"]);
    expect(readFileSync(join(FONTS, "OFL-CourierPrime.txt"), "utf8")).toContain(
      "Courier Prime Project Authors",
    );
  });

  it("advances the same width in every weight, so a mark cannot move a page break", () => {
    // This is the claim the whole layout rests on: bold and italic are real
    // cuts (ADR-0001), not synthesized, and they are monospaced to the same
    // advance. If they were not, italicising a line could rewrap it, and
    // ADR-0027's marks would silently change the page count.
    const advances = WEIGHTS.map((weight) => {
      const { unitsPerEm, advance } = metrics(`CourierPrime-${weight}.ttf`);
      return advance / unitsPerEm;
    });
    expect(new Set(advances).size).toBe(1);

    // 1228/2048 em. Ten characters to the inch at 12pt, to within 0.06% — which
    // is why the table is in characters and the stylesheet in `ch`, and not in
    // inches that would be a little bit wrong 61 times over.
    expect(advances[0]).toBeCloseTo(1228 / 2048, 10);
    expect(CHARACTER_INCHES).toBeCloseTo(0.1, 3);
    expect(CHARACTER_INCHES).not.toBe(0.1);
  });
});
