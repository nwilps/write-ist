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
 * what decides a wrap and therefore a page break.
 *
 * **A character is 7.0pt, not 7.2.** Courier at 12pt advances 0.6 em = 7.2pt,
 * and that is what the first measurements here assumed. The PDFs do not set it
 * so: Final Draft writes every text run with a character-spacing (`Tc`) of
 * about -0.018 (12 x -0.018 = -0.21pt), so the pen advances 6.99pt a character.
 * Two independent checks agree. Big Fish's transitions solve to one right edge
 * only at 7.0 (`CUT TO:` at 491pt with 7 characters, `MATCH CUT TO:` at 449pt
 * with 13: 491 + 7x7 = 449 + 13x7 = 540pt exactly, where 7.2 gives 541.4 and
 * 542.6), and Brick & Steel's `SMASH CUT TO:` puts `TO:` ten characters after
 * `SMASH` at 69.84pt, which is 6.98 a character. The paper therefore advances
 * 7pt a character too — Courier Prime at 12pt with a negative letter-spacing
 * that takes its 7.195pt advance down to 7 (`stylesheet()`) — so that a line of
 * N characters is N x 7pt of paper in the app, in the PDF Final Draft printed,
 * and in the PDF Write-ist prints. Every position below is a measured point
 * count divided by 7.
 *
 * Holding the measure in characters is also ADR-0024's mitigation for the one
 * risk its wrap measurement did not cover: *"if the editor column is not an
 * exact whole number of Courier Prime advance widths, three engines can round
 * the fit differently."* The stylesheet emits these as CSS `ch`, which **is**
 * the advance width, so a measure is a multiple of it by construction on all
 * three platforms rather than by arithmetic that could be a fraction of a pixel
 * out.
 *
 * **That mitigation is only complete where the measure is a whole number**, and
 * it is for every element whose wrapping the PDF actually shows: action, scene
 * headings and dialogue. A cue's and a parenthetical's are fractional because
 * they are not measured at all — they run to the right margin from an indent
 * that is itself a fraction — and neither wraps anywhere in *Big Fish*, so
 * neither exercises the rounding. `test/app/manuscript-geometry.test.ts` holds
 * that division, so a measure cannot quietly become fractional once something
 * does wrap against it.
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
   * Measured: 1,882 of the PDF's lines begin at exactly x = 108pt — 1,690
   * action lines and 192 scene-heading lines, which share the margin.
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
   * Measured: of the PDF's 1,690 action lines, 144 are exactly 61 characters
   * and none is 63. At 7pt a character 61 of them are 427pt, which ends at
   * 535pt — inside the 540pt (7.5in) right margin, with 5pt spare, so no
   * overrun needs explaining. (At 7.2pt they would reach 547pt and need one.)
   */
  measureCharacters: 61,

  /**
   * Characters from the left margin to the right margin proper: 432pt, which is
   * 7.5in on the sheet.
   *
   * Measured exactly, from the one element Final Draft right-aligns in Big
   * Fish: `CUT TO:` at 491pt and `MATCH CUT TO:` at 449pt both end at 540pt.
   */
  rightMarginCharacters: 432 / 7,
} as const;

/**
 * **The spacing table: the vertical half of the page's geometry** (ADR-0038).
 *
 * How many blank lines the paper and the PDF leave between two elements, keyed
 * by the *pair* of element types — the one above, the one below. The
 * pagination engine, the paper's stylesheet (generated below) and the PDF all
 * read it, so they cannot disagree. It is presentation: the Fountain file's own
 * blank-line rule (`needsBlankLine`, ADR-0019) is a separate thing and is not
 * read from here.
 *
 * - `blank` is how many blank lines the gap holds: any whole number from 0 up.
 *   Nothing downstream assumes 0 or 1.
 * - `squishable` says whether the writer may squish the gap to nothing
 *   (Backspace at the start of the lower element; Enter at the end of the upper
 *   restores it). A squished gap is the lower element's `squished` flag.
 *
 * **First matching row wins**, so put a pair above the row that covers it.
 * `"any"` matches every type. Changing a spacing, or allowing a new squishable
 * pair, is a one-line edit here — `npm run geometry` then regenerates the
 * stylesheet, and a test fails if it is stale.
 *
 * The defaults are Final Draft's standard template: two blank lines before a
 * scene heading (Write-ist has no shot element yet; it would join that row),
 * one before action, a character and a transition, none inside a speech.
 */
export interface Gap {
  readonly blank: number;
  readonly squishable: boolean;
}

export interface SpacingRule extends Gap {
  readonly above: ElementType | "any";
  readonly below: ElementType | "any";
}

const rule = (
  above: SpacingRule["above"],
  below: SpacingRule["below"],
  blank: number,
  squishable = false,
): SpacingRule => ({ above, below, blank, squishable });

export const SPACING: readonly SpacingRule[] = [
  // A boneyard delimiter sits against what it delimits.
  rule("boneyard-start", "any", 0),
  rule("any", "boneyard-end", 0),
  // No blank line falls inside a speech.
  rule("character", "dialogue", 0),
  rule("character", "parenthetical", 0),
  rule("dialogue", "dialogue", 0),
  rule("dialogue", "parenthetical", 0),
  rule("parenthetical", "dialogue", 0),
  rule("parenthetical", "parenthetical", 0),
  rule("lyrics", "lyrics", 0),
  // The pairs a writer may squish.
  rule("action", "action", 1, true),
  rule("centered", "centered", 1, true),
  // Final Draft: two blank lines before a scene heading.
  rule("any", "scene-heading", 2),
  // Everything else.
  rule("any", "any", 1),
];

/** The gap the table gives two adjacent elements. */
export function gapBetween(above: ElementType, below: ElementType): Gap {
  const found = SPACING.find(
    (row) => (row.above === "any" || row.above === above) && (row.below === "any" || row.below === below),
  );
  return found ?? { blank: 1, squishable: false };
}

/** Blank lines between two elements, the lower one's `squished` flag taken into account. */
export function gapLines(above: ElementType, below: ElementType, squished: boolean): number {
  const gap = gapBetween(above, below);
  return squished && gap.squishable ? 0 : gap.blank;
}

/**
 * Inches per character: 7pt, the pen advance the PDFs measure (see *Characters,
 * not inches* above), which is a hair under the tenth of an inch Courier's own
 * 7.2pt would be. Every length below is derived through this rather than through
 * a tidier division by ten.
 */
export const CHARACTER_POINTS = 7;
export const CHARACTER_INCHES = CHARACTER_POINTS / 72;

/**
 * Courier Prime's own advance, in em: 1228/2048. The stylesheet takes the
 * difference between this and `CHARACTER_POINTS` off every character, so the
 * face is drawn at 12pt with the PDF's tracking.
 */
export const COURIER_PRIME_ADVANCE_EM = 1228 / 2048;

/** Inches a run of characters occupies. */
export const inchesFor = (characters: number): number => characters * CHARACTER_INCHES;

/** Inches from the sheet's right edge to where the widest measure ends. */
export const marginRightInches = (): number =>
  PAGE.widthInches - PAGE.marginLeftInches - inchesFor(PAGE.measureCharacters);

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
function marginalia(element: string): ElementMeasure {
  return {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "left",
    source: `${element} is Fountain's, not Final Draft's — it never reaches a printed page, so the PDF fixes no geometry for it. It takes action's indent and measure.`,
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
      "Measured: 192 scene-heading lines at exactly x = 108pt (1.5in), which is action's indent — the two share the margin. None is longer than 55 characters, so the measure below is action's rather than one the PDF exercised on a heading. The reference agrees.",
  },

  action: {
    indent: 0,
    width: PAGE.measureCharacters,
    alignment: "left",
    source:
      "Measured: 1,690 action lines at exactly x = 108pt (1.5in). The measure is 61 characters — 144 of those lines are exactly 61, three are 62 and every one of the three breaks after a hyphen, and none is 63. See PAGE.measureCharacters for why 61 and not the 60 the margins imply.",
  },

  character: {
    indent: 135 / 7,
    width: PAGE.rightMarginCharacters - 135 / 7,
    alignment: "left",
    source:
      "Indent measured: 784 cues at exactly x = 243pt, which is 3.375in, or 135/7 = 19.29 characters from the left margin. Not a whole character, and recorded as measured. (Brick & Steel's cues sit at 252pt, 9pt further in: that is Final Draft's stock template against John August's, and Big Fish stays the authority here.) **The measure is not observed** — no cue in Big Fish wraps and the longest is 27 characters — so it runs to the page's right margin. A narrower guess would wrap a cue Final Draft does not, and inventing a page break is worse than allowing a wide one. The reference puts the indent at 2.0in; the PDF says 1.875in, and the PDF wins.",
  },

  dialogue: {
    indent: 9,
    width: 39,
    alignment: "left",
    source:
      "Measured: 1,720 lines at exactly x = 171pt, which is 2.375in, or exactly 9 characters from the left margin at 7pt a character. The measure is 39 — 202 lines are exactly 39, two are 40 and both break after a hyphen, and none is 41. The reference puts the indent at 1.0in and the measure at 35 characters; the PDF says 0.875in and 39, and the PDF wins on both.",
  },

  parenthetical: {
    indent: 92 / 7,
    width: PAGE.rightMarginCharacters - 92 / 7,
    alignment: "left",
    source:
      "Indent measured: 97 parentheticals at exactly x = 200pt, which is 2.7778in, or 92/7 = 13.14 characters from the left margin. Not a whole character, and recorded as measured rather than rounded. **The measure is not observed** — none wraps and the longest is 30 characters — so, like a cue's, it runs to the page's right margin. The reference puts the indent at 1.5in and the measure at 20 characters, and the PDF contradicts the measure outright by printing a 30-character parenthetical on one line.",
  },

  transition: {
    indent: 0,
    width: 403.2 / 7,
    alignment: "right",
    source:
      "Measured on Fountain's Brick & Steel PDF (Final Draft's stock template): transitions are right-aligned, not set at a fixed left indent — `CUT TO:` (7 characters) begins at 462pt and `SMASH CUT TO:` (13) at 420pt, and both end at exactly 511.2pt, which is 7.1in, Final Draft's stock right edge for a transition (left 5.5in). The box runs from the left margin to that edge, 403.2/7 = 57.6 characters, rather than from 5.5in: Final Draft would wrap a transition longer than 16 characters, and Write-ist does not invent a page break the PDF never exercised. Big Fish's own template right-aligns to 540pt (7.5in) instead; the stock edge wins because it is what Final Draft ships, and Brick & Steel is the PDF the dual-dialogue geometry is measured from.",
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

/**
 * One title-page field's place on page 1 (#62).
 *
 * Title-page lines are not element types — they are `Key: value` pairs — so they
 * sit beside `ELEMENT_GEOMETRY` in the same table rather than inside it. Positions
 * are from the sheet's edges (US Letter 612×792pt), matching the PDF measure.
 */
export interface TitlePagePlacement {
  readonly alignment: Alignment;
  /**
   * Inches from the sheet's left edge. For a left-aligned field this is the
   * line's left edge; for a right-aligned field it is the right edge the text
   * aligns to; ignored when centred (the sheet's centre is used instead).
   */
  readonly xInches: number;
  /**
   * Points from the sheet's top edge to the first line's baseline, as the PDF
   * wrote it. Continuation lines add `PAGE.leadingPoints` per step.
   */
  readonly yPoints: number;
  /**
   * When true, `yPoints` is the baseline of the field's *last* line and earlier
   * lines stack upward from it, so the field's bottom edge stays put however
   * many lines it has.
   */
  readonly growsUp?: boolean;
  readonly source: string;
}

/**
 * Title-page geometry, keyed by Fountain key (#62).
 *
 * Measured from page 1 of Final Draft's PDF of *Big Fish* — the same pass that
 * produced `ELEMENT_GEOMETRY`. Keys Write-ist has no row for are still drawn;
 * they simply take no absolute placement and stay in the flow at the top.
 */
export const TITLE_PAGE_GEOMETRY: Readonly<Record<string, TitlePagePlacement>> = {
  Title: {
    alignment: "centre",
    xInches: PAGE.widthInches / 2,
    yPoints: 261,
    source:
      "Measured: `Big Fish` centred (text run x = 278pt; centre of the string against the sheet's 306pt centre). Baseline y = 261pt.",
  },
  Credit: {
    alignment: "centre",
    xInches: PAGE.widthInches / 2,
    yPoints: 309,
    source: "Measured: `written by` centred; baseline y = 309pt.",
  },
  Author: {
    alignment: "centre",
    xInches: PAGE.widthInches / 2,
    yPoints: 333,
    source: "Measured: `John August` centred; baseline y = 333pt.",
  },
  Source: {
    alignment: "centre",
    xInches: PAGE.widthInches / 2,
    yPoints: 393,
    source: "Measured: `based on the novel by Daniel Wallace` centred; baseline y = 393pt.",
  },
  Notes: {
    alignment: "right",
    xInches: 7.5,
    yPoints: 585,
    source:
      "Measured: three Notes lines right-aligned to exactly 540pt (7.5in), the screenplay's own right margin — same edge transitions fix. First baseline y = 585pt; the next two fall on the 12pt grid at 597 and 609.",
  },
  Copyright: {
    alignment: "left",
    xInches: 1.0,
    yPoints: 645,
    source:
      "Measured: `(c) 2003 Columbia Pictures` at x = 72pt (1.0in) — half an inch outside the 1.5in text margin. Baseline y = 645pt. Not a mistake; the PDF puts it there.",
  },
  Contact: {
    alignment: "left",
    xInches: 1.0,
    yPoints: 645,
    source:
      "Same place as Copyright: left at 1.0in (#62 acceptance). Big Fish carries no Contact line, so the y is Copyright's; a Contact block stacks on the leading from there.",
  },
  "Draft date": {
    alignment: "left",
    xInches: 1.0,
    yPoints: 645 - 2 * PAGE.leadingPoints,
    growsUp: true,
    source:
      "Bottom-left block, directly above Contact with exactly one empty line between: its last baseline is two leadings above Contact's first (645 - 24 = 621pt). Not measured from Big Fish, which has no Draft date.",
  },
};

/** One speech element's place inside one column of a dual-dialogue pair. */
export interface DualMeasure {
  /** Characters from the column's left edge to the element's left edge. */
  readonly indent: number;
  /** How many characters fit on one of its lines before the text wraps. */
  readonly width: number;
}

/**
 * **Dual dialogue: two speeches side by side.**
 *
 * **Measured** from Fountain's own PDF of `Brick & Steel` (fountain.io,
 * `Brick-&-Steel.pdf`, 612 x 792pt, Courier 12pt advancing 7pt a character —
 * see *Characters, not inches*, left margin 108pt = 1.5in), its one
 * dual-dialogue pair, with `pdftotext -bbox`:
 *
 *   - left dialogue "Screw retirement." begins at x = 108pt: column start 0.
 *   - right dialogue begins at x = 333pt: (333 - 108) / 7 = 32.14 characters.
 *   - STEEL spans 194-229pt, centre 211.5; BRICK spans 419-454pt, centre
 *     436.5. A cue is centred on its column, so each column's half-width is
 *     211.5 - 108 = 436.5 - 333 = 103.5pt: the column is 207pt, 2.875in,
 *     207/7 = 29.57 characters. The right column then ends at 225 + 207 =
 *     432pt, the page's 7.5in right margin, and the gutter is 18pt.
 *   - The right dialogue ends at 452pt, directly under the S of the following
 *     SMASH CUT TO: (420-455pt).
 *
 * Dialogue and parentheticals wrap at whole characters (ADR-0024): 29 fit in
 * 29.57. The PDF's pair has no parenthetical; its indent is the single
 * column's own offset from dialogue (209pt against 180pt, 29pt = 4.14
 * characters, held at a whole 4), and its measure is what is left of the column.
 */
export const DUAL_GEOMETRY = {
  /** Characters across one column; a cue is centred on this. */
  columnWidth: 207 / 7,
  /** Characters from the left margin to each column's left edge. */
  columnStart: { left: 0, right: 225 / 7 },
  speech: {
    // The cue is centred across the whole column (`columnWidth`) by the
    // stylesheet; `width` is the most it may fill before it wraps.
    character: { indent: 0, width: 29 },
    parenthetical: { indent: 4, width: 25 },
    dialogue: { indent: 0, width: 29 },
  } satisfies Record<"character" | "parenthetical" | "dialogue", DualMeasure>,
} as const;

export const dualIndentProperty = (type: keyof typeof DUAL_GEOMETRY.speech): string =>
  `--dual-indent-${type}`;
export const dualWidthProperty = (type: keyof typeof DUAL_GEOMETRY.speech): string =>
  `--dual-width-${type}`;

/** CSS custom property names, so the stylesheet and its test cannot drift. */
export const indentProperty = (type: ElementType): string => `--indent-${type}`;
export const widthProperty = (type: ElementType): string => `--width-${type}`;
export const alignProperty = (type: ElementType): string => `--align-${type}`;

/** What CSS calls each of our alignments. Ours is spelled the English way. */
const CSS_ALIGNMENT: Readonly<Record<Alignment, string>> = {
  left: "left",
  right: "right",
  centre: "center",
};

/** A number as CSS should read it: four decimals at most, no trailing zeroes. */
function shortest(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** CSS pixels per inch. The one number in the whole file that is a convention. */
const PIXELS_PER_INCH = 96;

const inches = (value: number): string => `${shortest(value * PIXELS_PER_INCH)}px`;
/**
 * A run of characters as CSS reads it. Not `ch`: the page tracks Courier Prime
 * down to the PDF's 7pt advance with a negative letter-spacing, and `ch` is the
 * glyph's advance without it. `--ch` is the advance with it.
 */
export const characters = (value: number): string => `calc(${shortest(value)} * var(--ch))`;

/**
 * The spacing table as the paper's margins: one selector for every ordered pair
 * of element types, and then the
 * squished form of each pair the table allows. Every pair is spelled out, so a
 * change to the table cannot leave a pair on a stale default.
 *
 * A gap is `blank` times one blank line (`--manuscript-blank`), so any count
 * works and nothing here knows 0 and 1 are special beyond how they are spelled.
 * The squished rules are one compound more specific than the pairs they
 * override, and they match only pairs the table lets the writer squish: a
 * `data-squished` flag on any other pair does nothing, here as in pagination.
 */
function spacingStylesheet(types: readonly ElementType[]): string[] {
  const margin = (blank: number): string =>
    blank === 0 ? "0" : blank === 1 ? "var(--manuscript-blank)" : `calc(var(--manuscript-blank) * ${blank})`;
  const out = [
    "/*",
    " * The spacing table (ADR-0038): blank lines between two adjacent elements,",
    " * for every ordered pair of types. A squished gap is the lower element's",
    " * `data-squished`, honoured only where the table allows the pair.",
    " *",
    " * One rule to a pair rather than a selector list: a list of a hundred pairs",
    " * is a selector some engines will not read.",
    " */",
    "",
  ];
  const squished: string[] = [];
  for (const above of types) {
    for (const below of types) {
      const gap = gapBetween(above, below);
      const pair = `.manuscript > [data-element="${above}"] + [data-element="${below}"]`;
      out.push(`${pair} { margin-top: ${margin(gap.blank)}; }`);
      if (gap.squishable) squished.push(`${pair}[data-squished] { margin-top: 0; }`);
    }
  }
  out.push("", ...squished, "");
  return out;
}

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
    "  /* One character of paper: the PDFs' 7pt advance, not Courier's 7.2. */",
    `  --ch: ${CHARACTER_POINTS}pt;`,
    "  /* What Courier Prime must give up per character to advance exactly --ch. */",
    `  --manuscript-tracking: calc(var(--ch) - ${COURIER_PRIME_ADVANCE_EM}em);`,
    `  --manuscript-leading: ${shortest(PAGE.leadingPoints / PAGE.fontSizePoints)};`,
    "  /* One blank line, drawn as space: the unit the spacing table counts in. */",
    "  --manuscript-blank: calc(var(--manuscript-size) * var(--manuscript-leading));",
    "",
    "  /* --- Each element's place on it -------------------------------------- */",
    "",
  ];

  for (const type of types) {
    const { indent, width, alignment } = ELEMENT_GEOMETRY[type];
    lines.push(`  ${indentProperty(type)}: ${characters(indent)};`);
    lines.push(`  ${widthProperty(type)}: ${characters(width)};`);
    lines.push(`  ${alignProperty(type)}: ${CSS_ALIGNMENT[alignment]};`);
  }

  lines.push("");
  lines.push("  /* --- Dual dialogue: two columns across the measure ------------------- */");
  lines.push("");
  lines.push(`  --dual-column-width: ${characters(DUAL_GEOMETRY.columnWidth)};`);
  lines.push(`  --dual-start-left: ${characters(DUAL_GEOMETRY.columnStart.left)};`);
  lines.push(`  --dual-start-right: ${characters(DUAL_GEOMETRY.columnStart.right)};`);
  for (const type of Object.keys(DUAL_GEOMETRY.speech) as (keyof typeof DUAL_GEOMETRY.speech)[]) {
    const { indent, width } = DUAL_GEOMETRY.speech[type];
    lines.push(`  ${dualIndentProperty(type)}: ${characters(indent)};`);
    lines.push(`  ${dualWidthProperty(type)}: ${characters(width)};`);
  }

  lines.push("");
  lines.push("  /* The sheet, for the borders and seams that read it. */");
  lines.push(`  --page-height: ${inches(PAGE.heightInches)};`);
  lines.push("}", "");
  lines.push(...spacingStylesheet(types));

  return lines.join("\n");
}
