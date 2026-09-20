/**
 * **The industry layout, as one table** (#40).
 *
 * A screenplay's geometry is not decoration: one page is roughly one minute of
 * screen time, so where a line wraps decides where a page breaks, and where a
 * page breaks is the number the industry reads. ADR-0001 therefore pins the
 * whole thing to **Courier Prime at 12pt, bundled** — a face resolved from the
 * system moves a page break — and ADR-0024 puts the count in our own engine
 * rather than in the webview.
 *
 * That makes this file load-bearing in a way a stylesheet is not. **It is the
 * one table.** The Editor lays the page out from it (through the stylesheet
 * `app/src/style/geometry.css`, which is *generated* from it by
 * `stylesheet()` below and checked against it by
 * `test/app/manuscript-geometry.test.ts`), and the pagination engine (#48)
 * measures against the same numbers. Two tables would let what the writer sees
 * and what gets counted drift, and the drift would be silent.
 *
 * ## Where the numbers come from
 *
 * **Final Draft's PDF of *Big Fish*, published on fountain.io**, measured
 * directly — not from the spec text, and not from the reference stylesheet.
 * Every value below carries its own provenance in `source`, and where the
 * reference and the PDF disagree the PDF wins and the disagreement is written
 * down beside the value, as #40 requires.
 *
 * Method, 2026-09-20: the PDF's 122 pages were decompressed and every text
 * run's `Tm` matrix read, giving the exact pen position and font size of each
 * line — not an ink bounding box, which is what a text extractor reports and
 * what would have made every one of these numbers a little wrong. All 4,668
 * runs are set at 12pt, and their x positions fall into a handful of exact
 * values.
 *
 * ## Characters, not inches
 *
 * Indents and measures below are in **characters**, because a character is
 * what decides a wrap and therefore a page break. Courier Prime's advance is
 * 1228/2048 em = 0.5996 em, so a character at 12pt is 0.09994in — 10 characters
 * per inch to within 0.06%.
 *
 * Holding the measure in characters is also ADR-0024's mitigation for the one
 * risk its wrap measurement did not cover: *"if the editor column is not an
 * exact whole number of Courier Prime advance widths, three engines can round
 * the fit differently."* The stylesheet emits these as CSS `ch`, which **is**
 * the advance width, so the column is an exact multiple of it by construction
 * on all three platforms rather than by arithmetic that could be a fraction of
 * a pixel out.
 *
 * Two of Final Draft's indents are not whole characters. They are recorded as
 * measured rather than rounded to something tidier: rounding a cue's indent by
 * a quarter of a character would be inventing a number, and the fraction costs
 * nothing.
 */
import type { ElementType } from "./document.ts";

/** How a line sits in its measure. */
export type Alignment = "left" | "right" | "centre";

/** One element type's place on the page. */
export interface ElementMeasure {
  /** Characters from the left margin to the element's left edge. */
  readonly indent: number;
  /** How many characters fit on one of its lines before the text wraps. */
  readonly width: number;
  readonly alignment: Alignment;
  /** Where the two numbers come from, and what disagrees with them. */
  readonly source: string;
}

/**
 * The sheet, and the type on it.
 *
 * `linesPerPage` is here rather than with the pagination engine because it is
 * the same measurement as the margins — 55 lines at six to the inch is what is
 * left of 11 inches once the margins are taken — and splitting the vertical
 * half of the page's geometry away from the horizontal half is the two-tables
 * problem in miniature.
 */
export const PAGE = {
  /** Inches. US Letter, which is what the PDF is: 612 x 792 points. */
  widthInches: 8.5,
  heightInches: 11,

  /** Points. Every one of the PDF's 4,668 text runs is set at this size. */
  fontSizePoints: 12,
  /**
   * Points from one baseline to the next. Measured: the PDF's baselines fall
   * on an exact 12-point grid, so the leading equals the size — single-spaced,
   * six lines to the inch.
   *
   * **The reference disagrees and loses.** The spike sets `line-height: 1.4`,
   * which is comfortable to read and is not a screenplay: it would put 39 lines
   * on a page where Final Draft puts 55, and the page count is the thing this
   * whole file exists to get right.
   */
  leadingPoints: 12,

  /**
   * Inches from the sheet's left edge to the left margin.
   *
   * Measured: 1,882 of the PDF's runs — every scene heading and every action
   * line — begin at exactly x = 108pt.
   */
  marginLeftInches: 1.5,
  /**
   * Inches from the sheet's top edge to the first line's box.
   *
   * Measured: the first body baseline sits at y = 81pt on 110 of the 122 pages.
   * A 12pt line's baseline sits about 0.18in below the top of its box, which
   * puts the box at 1.0in.
   */
  marginTopInches: 1,

  /**
   * **How many lines of type a page holds.** Measured: baselines run from
   * y = 81pt to y = 729pt, which is 55 lines at 12pt.
   *
   * Eight of the 122 pages start one line higher, at y = 69pt, and hold 56.
   * Those are Final Draft's own continuation headers rather than the writer's
   * lines, so 55 is the measure the manuscript gets.
   */
  linesPerPage: 55,

  /**
   * Characters across the widest measure on the page — action's.
   *
   * **Measured, and it disagrees with the arithmetic.** 1.5in of left margin
   * and Final Draft's nominal 1in right margin leave 6.0in, which is 60
   * characters at ten to the inch. The PDF wraps action at **61**: of 1,882
   * action lines, 144 are exactly 61 characters and none is 63. Final Draft
   * lays its own text out at about 7.0pt per character rather than 7.2, so 61
   * of them fit inside its 7.5in right margin; drawn at Courier Prime's true
   * advance the same 61 characters reach 7.6in.
   *
   * Write-ist matches **the character count, not the inch**, because the
   * character count is what moves a page break. The consequence is a right
   * margin of 0.9in rather than 1.0in, which is `marginRightInches` below.
   */
  measureCharacters: 61,

  /**
   * Characters from the left margin to the right margin proper.
   *
   * Measured exactly, from the one element Final Draft right-aligns. Four
   * distinct transitions appear at four x positions, and solving them together
   * — `CUT TO:` at 491pt with 7 characters against `MATCH CUT TO:` at 449pt
   * with 13 — gives a right edge of exactly 540pt, or 7.5in, with no remainder
   * on the other two. So the page's right margin is 1.0in, and action's
   * sixty-first character is Final Draft overrunning it.
   */
  rightMarginCharacters: 60,
} as const;

/** Inches per character, from Courier Prime's own advance at `fontSizePoints`. */
export const CHARACTER_INCHES = (PAGE.fontSizePoints * (1228 / 2048)) / 72;

/** Inches from the sheet's right edge to where the widest measure ends. */
export const marginRightInches = (): number =>
  PAGE.widthInches - PAGE.marginLeftInches - PAGE.measureCharacters / 10;

/** Inches of type down the page, and so where the bottom margin starts. */
export const bodyHeightInches = (): number =>
  (PAGE.linesPerPage * PAGE.leadingPoints) / 72;

/**
 * A measure for an element Fountain has and Final Draft does not print.
 *
 * Sections, synopses, notes, lyrics, page breaks and the boneyard's delimiters
 * are the writer's marginalia, not the screenplay: no Final Draft PDF can say
 * where they sit, because Final Draft never puts them on a page. They take the
 * action block, which is the page's own measure, and the reason is recorded
 * once here rather than repeated fourteen times.
 */
function marginalia(what: string): ElementMeasure {
  return {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "left",
    source: `${what} is Fountain's, not Final Draft's — it never reaches a printed page, so the PDF fixes no geometry for it. It takes the action block.`,
  };
}

/**
 * **The table.** Every element type, its indent and its measure, in characters
 * from the left margin.
 *
 * `ELEMENT_TYPES` in `schema.ts` is ADR-0021's whole vocabulary and this record
 * is keyed by it, so an element type added there without a place on the page
 * will not compile.
 */
export const ELEMENT_GEOMETRY: Readonly<Record<ElementType, ElementMeasure>> = {
  "scene-heading": {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "left",
    source:
      "Measured: scene headings share action's x = 108pt (1.5in) in the PDF, which 1,882 runs begin at. The reference agrees.",
  },

  action: {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "left",
    source:
      "Measured: x = 108pt (1.5in). The measure is 61 characters — 144 action lines are exactly 61, three are 62 and every one of those three breaks after a hyphen, and none is 63. See PAGE.measureCharacters for why 61 and not the 60 the margins imply.",
  },

  character: {
    indent: 18.75,
    width: PAGE.rightMarginCharacters - 18.75,
    alignment: "left",
    source:
      "Indent measured: 784 cues at exactly x = 243pt, which is 3.375in, or 18.75 characters from the left margin. Not a whole character, and recorded as measured. **The measure is not observed** — no cue in Big Fish wraps and the longest is 27 characters — so it runs to the page's right margin. A narrower guess would wrap a cue Final Draft does not, and inventing a page break is worse than allowing a wide one. The reference puts the indent at 2.0in; the PDF says 1.875in, and the PDF wins.",
  },

  dialogue: {
    indent: 8.75,
    width: 39,
    alignment: "left",
    source:
      "Measured: 1,720 lines at exactly x = 171pt, which is 2.375in, or 8.75 characters from the left margin. The measure is 39 — 202 lines are exactly 39, two are 40 and both break after a hyphen, and none is 41. The reference puts the indent at 1.0in and the measure at 35 characters; the PDF says 0.875in and 39, and the PDF wins on both.",
  },

  parenthetical: {
    indent: 12.7778,
    width: PAGE.rightMarginCharacters - 12.7778,
    alignment: "left",
    source:
      "Indent measured: 97 parentheticals at exactly x = 200pt, which is 2.7778in, or 12.7778 characters from the left margin. Not a whole character, and recorded as measured rather than rounded. **The measure is not observed** — none wraps and the longest is 30 characters — so, like a cue's, it runs to the page's right margin. The reference puts the indent at 1.5in and the measure at 20 characters, and the PDF contradicts the measure outright by printing a 30-character parenthetical on one line.",
  },

  transition: {
    indent: 0,
    width: PAGE.rightMarginCharacters,
    alignment: "right",
    source:
      "Measured: right-aligned to exactly 540pt, or 7.5in — solved from four transitions at four x positions, with no remainder. This is the one element that fixes the page's right margin. The reference agrees that transitions are right-aligned.",
  },

  centered: {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "centre",
    source:
      "Fountain's `>text<`, which Final Draft has no element for, so it is centred in the action measure. The reference agrees.",
  },

  lyrics: marginalia("A lyric line"),
  section: marginalia("A section"),
  synopsis: marginalia("A synopsis"),
  "page-break": marginalia("A page break"),
  note: marginalia("A note"),
  "boneyard-start": marginalia("A boneyard delimiter"),
  "boneyard-end": marginalia("A boneyard delimiter"),
};

/** CSS custom property names, so the stylesheet and its test cannot drift. */
export const indentProperty = (type: ElementType): string => `--indent-${type}`;
export const measureProperty = (type: ElementType): string => `--measure-${type}`;

/** Trim a computed length to what CSS needs, without a trailing `.0`. */
function round(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** CSS pixels per inch. The one number in the whole file that is a convention. */
const PIXELS_PER_INCH = 96;

const inches = (value: number): string => `${round(value * PIXELS_PER_INCH)}px`;
const characters = (value: number): string => `${round(value)}ch`;

/**
 * **The table, rendered as the stylesheet the Editor reads.**
 *
 * The page cannot read TypeScript and the pagination engine cannot read CSS,
 * so one of the two has to be generated from the other. This is that
 * direction, and `test/app/manuscript-geometry.test.ts` fails if the file
 * checked in at `app/src/style/geometry.css` is not exactly what this returns
 * — which is what makes the generated half of the pair as trustworthy as the
 * table, and what stops anyone editing the stylesheet and wondering later why
 * the page count disagrees with the page.
 *
 * Lengths come out in CSS pixels for the sheet, because the sheet is drawn at
 * 96dpi, and in `ch` for anything a character count decides, because `ch` is
 * the advance width itself.
 */
export function stylesheet(): string {
  const types = Object.keys(ELEMENT_GEOMETRY) as ElementType[];
  const lines = [
    "/*",
    " * GENERATED FROM `src/screenplay/geometry.ts`. Do not edit.",
    " *",
    " * `npm run geometry` rewrites it and `test/app/manuscript-geometry.test.ts`",
    " * fails if it is stale. The industry layout is one table (#40), and this is",
    " * that table in the only language the page speaks.",
    " */",
    "",
    ":root {",
    "  /* --- The sheet ------------------------------------------------------- */",
    "",
    `  --page-width: ${inches(PAGE.widthInches)};`,
    `  --page-height: ${inches(PAGE.heightInches)};`,
    `  --page-inset-top: ${inches(PAGE.marginTopInches)};`,
    `  --page-inset-right: ${inches(marginRightInches())};`,
    `  --page-inset-bottom: ${inches(
      PAGE.heightInches - PAGE.marginTopInches - bodyHeightInches(),
    )};`,
    `  --page-inset-left: ${inches(PAGE.marginLeftInches)};`,
    "",
    "  /* --- The type on it -------------------------------------------------- */",
    "",
    `  --manuscript-size: ${inches(PAGE.fontSizePoints / 72)};`,
    `  --manuscript-leading: ${round(PAGE.leadingPoints / PAGE.fontSizePoints)};`,
    "  /* One blank line: the serialiser's spacing table, drawn as space. */",
    "  --manuscript-blank: calc(var(--manuscript-size) * var(--manuscript-leading));",
    `  --manuscript-lines-per-page: ${PAGE.linesPerPage};`,
    "",
    "  /* --- Each element's place on it -------------------------------------- */",
    "",
  ];

  for (const type of types) {
    const { indent, width } = ELEMENT_GEOMETRY[type];
    lines.push(`  ${indentProperty(type)}: ${characters(indent)};`);
    lines.push(`  ${measureProperty(type)}: ${characters(width)};`);
  }

  lines.push("}", "");
  return lines.join("\n");
}
