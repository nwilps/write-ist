/**
 * #48 — See the page count.
 *
 * Pages come from the model against `ELEMENT_GEOMETRY` and `PAGE.linesPerPage`,
 * never from the DOM (ADR-0001, ADR-0024). Targets are Final Draft's own counts
 * from the fountain.io PDFs of the same fixtures.
 */
import { describe, expect, it } from "vitest";
import { decodeFile } from "../../src/decode.ts";
import type { Element, ScreenplayDocument } from "../../src/screenplay/document.ts";
import { ELEMENT_GEOMETRY, PAGE } from "../../src/screenplay/geometry.ts";
import { exportScreenplay, importScreenplay } from "../../src/screenplay/import.ts";
import { parse } from "../../src/screenplay/parse.ts";
import {
  pageAtElement,
  pageCount,
  pageStatusText,
  paginate,
  wrapCount,
  wrapStarts,
} from "../../src/screenplay/paginate.ts";
import { describeCorpus, readCorpusBytes } from "../support/corpus.ts";
import { readFixtureBytes } from "../support/files.ts";

/** Import the way a writer would: CRLF and trailing space normalised. */
function loadFixture(name: string): ScreenplayDocument {
  return parse(
    decodeFile(exportScreenplay(importScreenplay(readFixtureBytes(name)).document)).text,
  );
}

function element(
  type: Element["type"],
  text: string,
  extra: Partial<Element> = {},
): Element {
  return { type, text, forced: false, ...extra };
}

function documentOf(elements: Element[], titlePage: ScreenplayDocument["titlePage"] = []): ScreenplayDocument {
  return { titlePage, elements, comments: [], endsWithNewline: true };
}

describe("paginate against Final Draft's published counts", () => {
  it("counts Brick & Steel as 4 pages", () => {
    // Final Draft's PDF of the fountain.io fixture is 4 pages. Our engine
    // lands on 4 with the measured geometry table and the page-break rules
    // of ADR-0033. Q-A changed where pages break (speeches now split, with
    // (MORE)/CONT'D) but not this count: 4 before and after.
    expect(pageCount(loadFixture("Brick-&-Steel.fountain"))).toBe(4);
  });

  it("counts Big Fish within one page of 120", () => {
    // Final Draft's PDF of Big Fish is 120 numbered body pages (title page
    // and the unnumbered epigraph page excluded). Geometry widths come from
    // that same PDF (`geometry.ts`); the engine lands on 120. Q-A (ADR-0033)
    // added 9 splits to the layout and left the count at 120.
    const pages = pageCount(loadFixture("Big-Fish.fountain"));
    expect(Math.abs(pages - 120)).toBeLessThanOrEqual(1);
    expect(pages).toBe(120);
  });
});

describe("front matter and title page", () => {
  it("does not count the title page", () => {
    const withTitle = documentOf(
      [element("scene-heading", "INT. ROOM - DAY"), element("action", "A beat.")],
      [
        {
          key: "Title",
          inline: { text: " Something", marks: [] },
          continuations: [],
        },
      ],
    );
    const without = documentOf([
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "A beat."),
    ]);
    expect(pageCount(withTitle)).toBe(pageCount(without));
  });

  it("leaves Big Fish's leading epigraph page unnumbered", () => {
    // The fixture opens with epigraph text, then ====, then FADE IN:. Final
    // Draft leaves the epigraph unnumbered; page 1 is the FADE IN: page.
    const doc = loadFixture("Big-Fish.fountain");
    const breakAt = doc.elements.findIndex((el) => el.type === "page-break");
    expect(breakAt).toBeGreaterThanOrEqual(0);
    const pagination = paginate(doc);
    // Everything before the leading break is unmapped (front matter).
    for (let i = 0; i < breakAt; i++) {
      expect(pagination.pageOfElement[i], `element ${i}`).toBeUndefined();
    }
    // The first printable after the break is on page 1.
    const firstAfter = doc.elements.findIndex(
      (el, i) => i > breakAt && el.omitted !== true && el.type !== "note",
    );
    expect(pagination.pageOfElement[firstAfter]).toBe(1);
  });
});

describe("cut material and comments take no space", () => {
  it("ignores omitted (boneyard) elements", () => {
    const visible = documentOf([
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "Only this."),
    ]);
    const withCut = documentOf([
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "Only this."),
      element("boneyard-start", "/*"),
      element("action", "A whole cut scene that would wrap many times if it counted. ".repeat(40), {
        omitted: true,
      }),
      element("boneyard-end", "*/"),
    ]);
    expect(pageCount(withCut)).toBe(pageCount(visible));
  });

  it("ignores notes, sections and synopses", () => {
    const base = documentOf([
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "A beat."),
    ]);
    const withMarginalia = documentOf([
      element("section", "Act One", { depth: 1 }),
      element("synopsis", "Something happens."),
      element("note", "Remember to fix this"),
      element("scene-heading", "INT. ROOM - DAY"),
      element("action", "A beat."),
    ]);
    expect(pageCount(withMarginalia)).toBe(pageCount(base));
  });
});

describe("forced page breaks", () => {
  it("starts a new numbered page at a mid-script page-break", () => {
    const doc = documentOf([
      element("scene-heading", "INT. A - DAY"),
      element("action", "Hello."),
      element("page-break", "==="),
      element("scene-heading", "INT. B - DAY"),
      element("action", "World."),
    ]);
    const pagination = paginate(doc);
    expect(pagination.totalPages).toBe(2);
    expect(pagination.pageOfElement[0]).toBe(1);
    expect(pagination.pageOfElement[3]).toBe(2);
  });
});

describe("status text and caret page", () => {
  it("formats the status bar in plain English", () => {
    expect(pageStatusText(3, 120)).toBe("Page 3 of 120");
    expect(pageStatusText(0, 0)).toBe("Page 0 of 0");
  });

  it("maps an element index to its page", () => {
    const doc = loadFixture("Brick-&-Steel.fountain");
    const pagination = paginate(doc);
    expect(pageAtElement(pagination, 0)).toBe(1);
    expect(pageAtElement(pagination, undefined)).toBe(1);
  });
});

describe("line wrapping against the geometry table", () => {
  /** The lines of `text`, as printed: each from its start to the next, less the spaces a wrap drops. */
  const linesOf = (text: string, width: number): string[] => {
    const starts = wrapStarts(text, width);
    return starts.map((at, i) => text.slice(at, starts[i + 1]).trimEnd());
  };

  it("wraps at each element's measured width, greedily at spaces", () => {
    // Recorded wrap comparison (#48): Final Draft's Big Fish PDF was the
    // source of ELEMENT_GEOMETRY. Action measure is 61 characters; a line of
    // 61 fits once, and 62 does not unless it ends on a hyphen (below).
    expect(PAGE.linesPerPage).toBe(55);
    expect(ELEMENT_GEOMETRY.action.width).toBe(61);
    expect(ELEMENT_GEOMETRY.dialogue.width).toBe(39);
    expect(wrapCount("a".repeat(61), 61)).toBe(1);
    expect(wrapCount("a".repeat(62), 61)).toBe(2);
  });

  // The next four are lines of Final Draft's Big Fish PDF (ADR-0024, amended).
  it("breaks after a hyphen, as Final Draft does", () => {
    expect(
      linesOf(
        "By the time I was born, he was already a legend.  He'd taken more hundred-dollar lures than any fish in Alabama.",
        ELEMENT_GEOMETRY.dialogue.width,
      ).slice(0, 3),
    ).toEqual([
      "By the time I was born, he was already",
      "a legend.  He'd taken more hundred-",
      "dollar lures than any fish in Alabama.",
    ]);
    // A hyphen is not a break before a digit or a space.
    expect(linesOf("a -5 b-5 c", 3)).toEqual(["a", "-5", "b-5", "c"]);
  });

  it("lets a hyphen hang one past the measure, and nothing else", () => {
    const width = ELEMENT_GEOMETRY.action.width;
    expect(
      linesOf("That hug finished, Sandra pushes past her son to her daughter-in-law.  Seeing it.", width),
    ).toEqual(["That hug finished, Sandra pushes past her son to her daughter-", "in-law.  Seeing it."]);
    expect(
      linesOf("As he leaves, Will mutters in perfect unison with his father--", width),
    ).toEqual(["As he leaves, Will mutters in perfect unison with his father--"]);
    expect(
      linesOf("He didn't mean for that to sound so pointed.  Taking the half-empty Ensure.", width)[0],
    ).toBe("He didn't mean for that to sound so pointed.  Taking the half-");
    expect(wrapCount("a".repeat(61) + "-", 61)).toBe(2);
  });

  it("measures two spaces after a full stop as two", () => {
    // Final Draft draws the two spaces and wraps them as two. Counted as one,
    // "or" would fit after "faster" (39) and the PDF's line would not be the
    // PDF's line: Big Fish's opening speech, as the PDF sets it.
    expect(
      linesOf(
        "There are some fish that cannot be caught.  It's not that they're faster or stronger than other fish.  They're just touched by something extra.",
        ELEMENT_GEOMETRY.dialogue.width,
      ),
    ).toEqual([
      "There are some fish that cannot be",
      "caught.  It's not that they're faster",
      "or stronger than other fish.  They're",
      "just touched by something extra.",
    ]);
  });
});

describeCorpus("acceptance corpus page count (reference only)", () => {
  it("comes out near the 137 pages afterwriting reports", () => {
    // afterwriting is a different engine; this is a reference check, not a gate.
    const doc = importScreenplay(readCorpusBytes()).document;
    const pages = pageCount(doc);
    expect(pages).toBeGreaterThan(120);
    expect(pages).toBeLessThan(160);
    // Soft target: within ~10 of afterwriting's 137.
    expect(Math.abs(pages - 137)).toBeLessThanOrEqual(15);
  });
});
